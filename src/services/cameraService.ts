import { useState, useEffect, useCallback } from 'react';
import { CameraStatus, CameraPermissionState } from '../types';

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

  private setStatus(status: CameraStatus, error?: string, permissionState?: CameraPermissionState) {
    this.status = status;
    this.errorMessage = error;
    if (permissionState) {
      this.permissionState = permissionState;
    }
    this.listeners.forEach((listener) => {
      try {
        listener(status, error, this.permissionState);
      } catch {
        // Safe ignore listener errors
      }
    });
  }

  /**
   * Check if getUserMedia is supported in the current environment
   */
  public isSupported(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  /**
   * Check if camera permission was previously granted in localStorage
   */
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

  /**
   * Mark camera permission as granted persistently
   */
  public static markPermissionGranted(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('iris_camera_permission_granted', 'true');
      }
    } catch {
      // Safe ignore
    }
  }

  /**
   * Clear camera permission in storage if explicitly revoked
   */
  public static clearStoredPermission(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('iris_camera_permission_granted');
      }
    } catch {
      // Safe ignore
    }
  }

  /**
   * Query the browser Permissions API for camera status.
   * Always checks live browser permission first when supported so revoked permissions are detected immediately.
   */
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
          // If browser explicitly says 'prompt', user has not granted or has reset permission
          return CameraService.hasStoredPermission() ? 'granted' : 'prompt';
        }
      } catch {
        // Fallback for browsers that do not support { name: 'camera' }
      }
    }

    return CameraService.hasStoredPermission() ? 'granted' : 'prompt';
  }

  /**
   * Classify a DOMException or Error from getUserMedia into an explicit CameraPermissionState
   */
  public static classifyCameraError(err: unknown): {
    permissionState: CameraPermissionState;
    userFriendlyError: string;
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
            'Your camera is currently in use by another application (e.g. video call). Close that application to monitor here.',
        };
      }

      if (name === 'OverconstrainedError' || name === 'AbortError' || name === 'InvalidStateError') {
        return {
          permissionState: 'Camera initialization failed',
          userFriendlyError:
            'The camera stream could not be initialized with the requested configuration. Please retry.',
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
      };
    }
    if (rawMsg.toLowerCase().includes('in use') || rawMsg.toLowerCase().includes('notreadable')) {
      return {
        permissionState: 'Camera in use by another application',
        userFriendlyError:
          'Your camera is currently being used by another application. Close or release the camera in that application before retrying.',
      };
    }
    if (rawMsg.toLowerCase().includes('not supported') || rawMsg.toLowerCase().includes('unavailable') || rawMsg.toLowerCase().includes('not found')) {
      return {
        permissionState: 'Camera unavailable',
        userFriendlyError:
          'Camera access is unavailable in this environment or no camera device was found.',
      };
    }

    return {
      permissionState: 'Camera initialization failed',
      userFriendlyError: rawMsg || 'Camera initialization failed. Please check your camera connection and try again.',
    };
  }

  /**
   * Enumerate available video input devices
   */
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
   * Attach existing stream or request permission and start the camera stream.
   * If an active stream already exists, reuses it immediately without prompting the user.
   */
  public async start(
    videoElement: HTMLVideoElement,
    deviceId?: string
  ): Promise<MediaStream> {
    if (!this.isSupported()) {
      const err = 'Camera access (navigator.mediaDevices.getUserMedia) is unavailable on this device.';
      this.setStatus('error', err, 'Camera unavailable');
      throw new Error(err);
    }

    // Fast path: If camera is already streaming and tracks are live, reuse without re-prompting
    if (this.isStreamActive() && this.mediaStream) {
      this.videoElement = videoElement;
      if (videoElement.srcObject !== this.mediaStream) {
        videoElement.srcObject = this.mediaStream;
        videoElement.playsInline = true;
        videoElement.muted = true;
        await videoElement.play().catch(() => {});
      }
      this.setStatus('running', undefined, 'Permission granted');
      CameraService.markPermissionGranted();
      return this.mediaStream;
    }

    // Stop stale inactive streams if any
    this.stop(false);

    this.videoElement = videoElement;
    this.setStatus('requesting_permission', undefined, 'Requesting permission');

    const constraints: MediaStreamConstraints = {
      audio: false, // Strict rule: video only, never request microphone
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          }
        : {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
    };

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr: unknown) {
        // Only fallback if OverconstrainedError; do not re-prompt if permission was denied or device missing
        const name = firstErr && typeof firstErr === 'object' && 'name' in firstErr ? String((firstErr as { name: string }).name) : '';
        if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        } else {
          throw firstErr;
        }
      }

      const tracks = stream.getVideoTracks();
      if (!tracks || tracks.length === 0 || tracks.every((t) => t.readyState === 'ended')) {
        stream.getTracks().forEach((t) => t.stop());
        this.setStatus('error', 'Camera stream started without an active video track.', 'Camera initialization failed');
        throw new Error('Camera initialization failed: no active video track.');
      }

      const handleTrackEnded = () => {
        if (!this.mediaStream) return;
        const live = this.mediaStream.getVideoTracks().filter((t) => t.readyState === 'live');
        if (live.length === 0) {
          this.setStatus('error', 'Camera was disconnected or stopped by system.', 'Camera unavailable');
        }
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

      // Wait for loadedmetadata event with a safety timeout so execution never hangs
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
      return stream;
    } catch (err: unknown) {
      this.stop(true);
      const classified = CameraService.classifyCameraError(err);
      this.setStatus('error', classified.userFriendlyError, classified.permissionState);
      throw new Error(classified.userFriendlyError);
    }
  }

  /**
   * Stop camera tracks. Only shuts off hardware if forceHardwareStop is true.
   */
  public stop(forceHardwareStop = true): void {
    if (this.status === 'stopping') return;

    if (forceHardwareStop && this.mediaStream) {
      this.setStatus('stopping');
      try {
        this.mediaStream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      } catch {
        // Safe ignore
      }
      this.mediaStream = null;
      if (this.videoElement) {
        try {
          this.videoElement.srcObject = null;
        } catch {
          // Safe ignore
        }
        this.videoElement = null;
      }
      this.setStatus('idle');
    } else if (!forceHardwareStop && this.videoElement) {
      // Detach element without stopping hardware stream
      try {
        this.videoElement.srcObject = null;
      } catch {
        // Safe ignore
      }
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

  useEffect(() => {
    const unsubscribe = service.addListener((newStatus, err, permState) => {
      setStatus(newStatus);
      setError(err);
      if (permState) {
        setPermissionState(permState);
      }
      setStream(service.getStream());
    });

    return () => {
      unsubscribe();
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

  return {
    status,
    permissionState,
    error,
    stream,
    isStreamActive: service.isStreamActive(),
    isSupported: service.isSupported(),
    getAvailableCameras: () => service.getAvailableCameras(),
    startCamera,
    stopCamera,
  };
}
