import { useState, useEffect, useCallback } from 'react';
import { CameraStatus, CameraPermissionState, CameraAccessMode, CameraStreamDiagnostics } from '../types';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export class CameraService {
  private static instance: CameraService | null = null;
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private status: CameraStatus = 'idle';
  private permissionState: CameraPermissionState = 'Permission not requested';
  private errorMessage?: string;
  private listeners: Set<(status: CameraStatus, error?: string, permissionState?: CameraPermissionState) => void> = new Set();

  // Multi-application shared mode & auto-recovery telemetry
  private cameraMode: CameraAccessMode = 'SHARED_FRAME_SERVER';
  private retryAttemptCount = 0;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private isUserStopped = true;
  private isTrackMuted = false;
  private concurrentAppName: string | null = null;
  private activeResolution: { width: number; height: number } | null = null;
  private activeFps = 0;
  private diagnosticsListeners: Set<(diag: CameraStreamDiagnostics) => void> = new Set();
  private lastDeviceId?: string;

  public static getInstance(): CameraService {
    if (!CameraService.instance) {
      CameraService.instance = new CameraService();
    }
    return CameraService.instance;
  }

  constructor(onStatusChange?: (status: CameraStatus, error?: string, permissionState?: CameraPermissionState) => void) {
    if (onStatusChange) {
      this.listeners.add(onStatusChange);
    }
  }

  public addListener(fn: (status: CameraStatus, error?: string, permissionState?: CameraPermissionState) => void): () => void {
    this.listeners.add(fn);
    fn(this.status, this.errorMessage, this.permissionState);
    return () => {
      this.listeners.delete(fn);
    };
  }

  public addDiagnosticsListener(fn: (diag: CameraStreamDiagnostics) => void): () => void {
    this.diagnosticsListeners.add(fn);
    fn(this.getDiagnostics());
    return () => {
      this.diagnosticsListeners.delete(fn);
    };
  }

  public getDiagnostics(): CameraStreamDiagnostics {
    return {
      width: this.activeResolution?.width || 0,
      height: this.activeResolution?.height || 0,
      fps: this.activeFps,
      isMuted: this.isTrackMuted,
      cameraMode: this.cameraMode,
      retryAttempts: this.retryAttemptCount,
      concurrentAppName: this.concurrentAppName,
    };
  }

  private notifyDiagnostics(): void {
    const diag = this.getDiagnostics();
    this.diagnosticsListeners.forEach((fn) => {
      try {
        fn(diag);
      } catch {}
    });
  }

  public setConcurrentAppName(name: string | null): void {
    this.concurrentAppName = name;
    this.notifyDiagnostics();
  }

  public getCameraMode(): CameraAccessMode {
    return this.cameraMode;
  }

  public getRetryAttempts(): number {
    return this.retryAttemptCount;
  }

  public isTrackCurrentlyMuted(): boolean {
    return this.isTrackMuted;
  }

  public getStatus(): CameraStatus {
    return this.status;
  }

  public getPermissionState(): CameraPermissionState {
    if (this.isStreamActive()) {
      return 'Monitoring active';
    }
    return this.permissionState;
  }

  public getError(): string | undefined {
    return this.errorMessage;
  }

  public getStream(): MediaStream | null {
    return this.mediaStream;
  }

  public isStreamActive(): boolean {
    if (!this.mediaStream || !this.mediaStream.active) return false;
    const tracks = this.mediaStream.getVideoTracks();
    return tracks.length > 0 && tracks.some((t) => t.readyState === 'live');
  }

  private isMeetingYieldActive = false;

  public setMeetingYieldActive(active: boolean): void {
    this.isMeetingYieldActive = active;
  }

  public getMeetingYieldActive(): boolean {
    return this.isMeetingYieldActive;
  }

  private setStatus(status: CameraStatus, error?: string, permissionState?: CameraPermissionState) {
    this.status = status;
    this.errorMessage = error;
    if (permissionState) {
      this.permissionState = permissionState;
    }
    this.listeners.forEach((listener) => {
      try {
        listener(status, error, this.permissionState);
      } catch {}
    });
    this.notifyDiagnostics();
  }

  public isSupported(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  public static hasStoredPermission(): boolean {
    try {
      return (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('iris_camera_permission_granted') === 'true'
      );
    } catch {
      return false;
    }
  }

  public static markPermissionGranted(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('iris_camera_permission_granted', 'true');
      }
    } catch {}
  }

  public static clearStoredPermission(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('iris_camera_permission_granted');
      }
    } catch {}
  }

  public static async checkBrowserPermission(): Promise<'granted' | 'prompt' | 'denied'> {
    if (
      typeof navigator !== 'undefined' &&
      navigator.permissions &&
      typeof navigator.permissions.query === 'function'
    ) {
      try {
        const queryResult = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        });
        if (queryResult.state === 'granted') {
          CameraService.markPermissionGranted();
          return 'granted';
        }
        if (queryResult.state === 'denied') {
          CameraService.clearStoredPermission();
          return 'denied';
        }
        if (queryResult.state === 'prompt') {
          return CameraService.hasStoredPermission() ? 'granted' : 'prompt';
        }
      } catch {}
    }
    return CameraService.hasStoredPermission() ? 'granted' : 'prompt';
  }

  public static classifyCameraError(err: unknown): {
    permissionState: CameraPermissionState;
    userFriendlyError: string;
    isBusyLock: boolean;
  } {
    if (err instanceof DOMException || (err && typeof err === 'object' && 'name' in err)) {
      const name = String((err as { name: string }).name);
      const message = 'message' in err ? String((err as { message: string }).message) : '';

      if (
        name === 'NotAllowedError' ||
        name === 'PermissionDeniedError' ||
        name === 'SecurityError' ||
        message.toLowerCase().includes('permission denied') ||
        message.toLowerCase().includes('not allowed') ||
        message.toLowerCase().includes('blocked')
      ) {
        CameraService.clearStoredPermission();
        return {
          permissionState: 'Camera blocked',
          userFriendlyError:
            'Camera permission was denied or blocked. Enable camera access in your browser or privacy settings and try again.',
          isBusyLock: false,
        };
      }

      if (
        name === 'NotFoundError' ||
        name === 'DevicesNotFoundError' ||
        message.toLowerCase().includes('not found') ||
        message.toLowerCase().includes('no webcam')
      ) {
        return {
          permissionState: 'Camera unavailable',
          userFriendlyError:
            'No camera was detected on this device. Connect a camera or check your hardware settings.',
          isBusyLock: false,
        };
      }

      if (
        name === 'NotReadableError' ||
        name === 'TrackStartError' ||
        message.toLowerCase().includes('already in use') ||
        message.toLowerCase().includes('in use') ||
        message.toLowerCase().includes('not readable')
      ) {
        return {
          permissionState: 'Camera in use by another application',
          userFriendlyError:
            'Your camera is currently in use by another application (e.g. video call). IRIS will connect in shared mode as soon as possible.',
          isBusyLock: true,
        };
      }

      if (name === 'OverconstrainedError' || name === 'AbortError' || name === 'InvalidStateError') {
        return {
          permissionState: 'Camera initialization failed',
          userFriendlyError:
            'The camera stream could not be initialized with the requested configuration. Retrying...',
          isBusyLock: false,
        };
      }
    }

    const rawMsg = err instanceof Error ? err.message : String(err ?? '');
    if (rawMsg.toLowerCase().includes('denied') || rawMsg.toLowerCase().includes('notallowed') || rawMsg.toLowerCase().includes('blocked')) {
      CameraService.clearStoredPermission();
      return {
        permissionState: 'Camera blocked',
        userFriendlyError:
          'Camera permission was denied or blocked. Enable camera access in your browser or privacy settings and try again.',
        isBusyLock: false,
      };
    }
    if (rawMsg.toLowerCase().includes('in use') || rawMsg.toLowerCase().includes('notreadable') || rawMsg.toLowerCase().includes('trackstart')) {
      return {
        permissionState: 'Camera in use by another application',
        userFriendlyError:
          'Your camera is currently in use by another application. IRIS is recovering connection in shared mode.',
        isBusyLock: true,
      };
    }
    if (rawMsg.toLowerCase().includes('not supported') || rawMsg.toLowerCase().includes('unavailable') || rawMsg.toLowerCase().includes('not found')) {
      return {
        permissionState: 'Camera unavailable',
        userFriendlyError:
          'Camera access is unavailable in this environment or no camera device was found.',
        isBusyLock: false,
      };
    }

    return {
      permissionState: 'Camera initialization failed',
      userFriendlyError: rawMsg || 'Camera initialization failed. Checking connection...',
      isBusyLock: false,
    };
  }

  public async getAvailableCameras(): Promise<CameraDevice[]> {
    if (!this.isSupported() || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${index + 1}`,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Acquire a cooperative, non-exclusive webcam stream using Windows Media Foundation
   * Frame Server shared mode constraints.
   */
  public async acquireSharedCameraStream(
    videoElement: HTMLVideoElement,
    deviceId?: string
  ): Promise<MediaStream> {
    if (!this.isSupported()) {
      const err = 'Camera access (navigator.mediaDevices.getUserMedia) is unavailable on this device.';
      this.setStatus('error', err, 'Camera unavailable');
      throw new Error(err);
    }

    this.videoElement = videoElement;
    this.lastDeviceId = deviceId;
    this.isUserStopped = false;

    // Fast path: Reuse live active stream
    if (this.isStreamActive() && this.mediaStream) {
      if (videoElement.srcObject !== this.mediaStream) {
        videoElement.srcObject = this.mediaStream;
        videoElement.playsInline = true;
        videoElement.muted = true;
        await videoElement.play().catch(() => {});
      }
      this.clearRecoveryTimer();
      this.retryAttemptCount = 0;
      this.cameraMode = 'SHARED_FRAME_SERVER';
      this.setStatus('running', undefined, 'Monitoring active');
      CameraService.markPermissionGranted();
      return this.mediaStream;
    }

    // Stop stale streams cleanly
    this.stop(false);
    this.videoElement = videoElement;
    this.setStatus('requesting_permission', undefined, 'Requesting permission');

    // Strict non-exclusive lightweight constraints (never exact constraints)
    // Ensures Windows Frame Server treats this as cooperative client
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? {
            deviceId: { ideal: deviceId },
            width: { ideal: 320, max: 640 },
            height: { ideal: 240, max: 480 },
            frameRate: { ideal: 20, max: 24 },
          }
        : {
            facingMode: { ideal: 'user' },
            width: { ideal: 320, max: 640 },
            height: { ideal: 240, max: 480 },
            frameRate: { ideal: 20, max: 24 },
          },
    };

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: unknown) {
        const name = firstErr && typeof firstErr === 'object' && 'name' in firstErr ? String((firstErr as { name: string }).name) : '';
        if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
          // Cooperative fallback with purely ideal video
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { width: { ideal: 320 }, height: { ideal: 240 } },
          });
        } else {
          throw firstErr;
        }
      }

      const tracks = stream.getVideoTracks();
      if (!tracks || tracks.length === 0 || tracks.every((t) => t.readyState === 'ended')) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('Camera stream returned without live video tracks.');
      }

      // Success: Clear recovery timers and set live shared mode
      this.clearRecoveryTimer();
      this.retryAttemptCount = 0;
      this.cameraMode = 'SHARED_FRAME_SERVER';

      const primaryTrack = tracks[0];
      this.isTrackMuted = primaryTrack.muted || false;

      try {
        const settings = primaryTrack.getSettings?.() || {};
        this.activeResolution = {
          width: settings.width || 320,
          height: settings.height || 240,
        };
        this.activeFps = Math.round(settings.frameRate || 24);
      } catch {
        this.activeResolution = { width: 320, height: 240 };
        this.activeFps = 24;
      }

      // Cooperative track listeners: Handle external app interruptions without killing IRIS
      primaryTrack.addEventListener('mute', () => {
        this.isTrackMuted = true;
        this.notifyDiagnostics();
        // If track remains muted after 800ms, silently re-acquire shared stream
        setTimeout(() => {
          if (this.isTrackMuted && !this.isUserStopped && this.cameraMode !== 'RECOVERING') {
            this.scheduleAutoRecovery(videoElement, deviceId);
          }
        }, 800);
      });

      primaryTrack.addEventListener('unmute', () => {
        this.isTrackMuted = false;
        this.notifyDiagnostics();
      });

      const handleTrackEnded = () => {
        if (this.isUserStopped) return;
        this.scheduleAutoRecovery(videoElement, deviceId);
      };

      tracks.forEach((track) => {
        track.addEventListener('ended', handleTrackEnded);
      });

      this.mediaStream = stream;
      CameraService.markPermissionGranted();
      this.setStatus('initializing', undefined, 'Monitoring active');

      videoElement.srcObject = stream;
      videoElement.playsInline = true;
      videoElement.muted = true;

      await new Promise<void>((resolve) => {
        let isResolved = false;
        const done = () => {
          if (!isResolved) {
            isResolved = true;
            videoElement.removeEventListener('loadedmetadata', done);
            videoElement.play().catch(() => {});
            resolve();
          }
        };

        const timeoutId = setTimeout(done, 2500);

        if (videoElement.readyState >= 1) {
          clearTimeout(timeoutId);
          done();
        } else {
          videoElement.addEventListener('loadedmetadata', () => {
            clearTimeout(timeoutId);
            done();
          });
        }
      });

      this.setStatus('running', undefined, 'Monitoring active');
      this.notifyDiagnostics();
      return stream;
    } catch (err: unknown) {
      const classified = CameraService.classifyCameraError(err);
      if (classified.isBusyLock && !this.isUserStopped) {
        this.scheduleAutoRecovery(videoElement, deviceId);
      } else {
        this.stop(true);
        this.setStatus('error', classified.userFriendlyError, classified.permissionState);
      }
      throw new Error(classified.userFriendlyError);
    }
  }

  /**
   * Smart auto-recovery loop: pauses 1500ms for external apps to initialize,
   * retries every 3 seconds up to 3 attempts, then falls back to standby probing every 8 seconds.
   */
  public scheduleAutoRecovery(videoElement?: HTMLVideoElement | null, deviceId?: string): void {
    if (this.isUserStopped) return;
    if (this.recoveryTimer) return; // Recovery already in flight

    const targetEl = videoElement || this.videoElement;
    if (!targetEl) return;

    const attempt = this.retryAttemptCount;
    let delayMs = 3000;

    if (attempt === 0) {
      // Step 1: Rapid silent 800ms re-acquisition to rejoin shared Windows Frame Server stream
      delayMs = 800;
      this.cameraMode = 'RECOVERING';
      this.setStatus(
        'recovering',
        'External camera app active. Rejoining shared stream...',
        'Camera in use by another application'
      );
    } else if (attempt < 3) {
      // Step 2: Retry every 3 seconds for 3 consecutive attempts
      delayMs = 3000;
      this.cameraMode = 'RECOVERING';
      this.setStatus(
        'recovering',
        `Reconnecting shared camera stream (attempt ${attempt + 1}/3)...`,
        'Camera in use by another application'
      );
    } else {
      // Step 3: Standby mode when external app holds strict exclusive lock
      delayMs = 8000;
      this.cameraMode = 'STANDBY_EXCLUSIVE_LOCK';
      this.setStatus(
        'error',
        'Standby (Exclusive Hardware Lock by External App). IRIS is actively monitoring to reconnect the instant shared mode is available.',
        'Standby (Exclusive Hardware Lock by External App)'
      );
    }

    this.notifyDiagnostics();

    this.recoveryTimer = setTimeout(async () => {
      this.recoveryTimer = null;
      if (this.isUserStopped) return;
      this.retryAttemptCount += 1;

      try {
        await this.acquireSharedCameraStream(targetEl, deviceId || this.lastDeviceId);
      } catch {
        // acquireSharedCameraStream handles subsequent scheduling
      }
    }, delayMs);
  }

  public clearRecoveryTimer(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  public resetRecoveryAttempts(): void {
    this.clearRecoveryTimer();
    this.retryAttemptCount = 0;
    if (this.videoElement && !this.isUserStopped) {
      this.acquireSharedCameraStream(this.videoElement, this.lastDeviceId).catch(() => {});
    }
  }

  public async start(videoElement: HTMLVideoElement, deviceId?: string): Promise<MediaStream> {
    this.isUserStopped = false;
    return this.acquireSharedCameraStream(videoElement, deviceId);
  }

  public stop(forceHardwareStop = true): void {
    this.isUserStopped = true;
    this.clearRecoveryTimer();
    this.retryAttemptCount = 0;

    if (this.status === 'stopping') return;

    if (forceHardwareStop && this.mediaStream) {
      this.setStatus('stopping');
      try {
        this.mediaStream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      } catch {}
      this.mediaStream = null;
      if (this.videoElement) {
        try {
          this.videoElement.srcObject = null;
        } catch {}
        this.videoElement = null;
      }
      this.activeResolution = null;
      this.activeFps = 0;
      this.isTrackMuted = false;
      this.cameraMode = 'SHARED_FRAME_SERVER';
      this.setStatus('idle');
    } else if (!forceHardwareStop && this.videoElement) {
      try {
        this.videoElement.srcObject = null;
      } catch {}
      this.videoElement = null;
    }
  }
}

export const sharedCameraService = CameraService.getInstance();

export function useCamera(options?: { keepAliveOnUnmount?: boolean }) {
  const service = CameraService.getInstance();
  const [status, setStatus] = useState<CameraStatus>(service.getStatus());
  const [permissionState, setPermissionState] = useState<CameraPermissionState>(service.getPermissionState());
  const [error, setError] = useState<string | undefined>(service.getError());
  const [stream, setStream] = useState<MediaStream | null>(service.getStream());
  const [diagnostics, setDiagnostics] = useState<CameraStreamDiagnostics>(service.getDiagnostics());

  useEffect(() => {
    const unsubStatus = service.addListener((newStatus, err, permState) => {
      setStatus(newStatus);
      setError(err);
      if (permState) {
        setPermissionState(permState);
      }
      setStream(service.getStream());
    });

    const unsubDiag = service.addDiagnosticsListener((diag) => {
      setDiagnostics(diag);
    });

    return () => {
      unsubStatus();
      unsubDiag();
      if (options?.keepAliveOnUnmount === false) {
        service.stop(true);
      }
    };
  }, [service, options?.keepAliveOnUnmount]);

  const startCamera = useCallback(
    async (videoEl: HTMLVideoElement, deviceId?: string) => {
      const s = await service.start(videoEl, deviceId);
      setStream(s);
      setPermissionState('Permission granted');
      return s;
    },
    [service]
  );

  const stopCamera = useCallback(
    (force = true) => {
      service.stop(force);
      setStream(null);
    },
    [service]
  );

  const resetRecovery = useCallback(() => {
    service.resetRecoveryAttempts();
  }, [service]);

  return {
    status,
    permissionState,
    error,
    stream,
    diagnostics,
    cameraMode: diagnostics.cameraMode,
    isStreamActive: service.isStreamActive(),
    isSupported: service.isSupported(),
    getAvailableCameras: () => service.getAvailableCameras(),
    startCamera,
    stopCamera,
    resetRecovery,
    setMeetingYieldActive: (active: boolean) => service.setMeetingYieldActive(active),
    setConcurrentAppName: (name: string | null) => service.setConcurrentAppName(name),
  };
}
