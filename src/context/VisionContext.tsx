import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { CameraStatus, VisionTelemetry } from '../types';
import { CameraService } from '../services/cameraService';
import { FaceLandmarkerService } from '../services/faceLandmarkerService';
import { BlinkDetector } from '../services/blinkDetector';
import { DistanceEstimator } from '../services/distanceEstimator';
import { TelemetryStorageService } from '../services/telemetryStorage';

interface ProximityAlertState {
  active: boolean;
  distanceCm: number;
  optimalCm: number;
}

interface VisionContextType {
  status: CameraStatus;
  errorMessage: string | null;
  telemetry: VisionTelemetry;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isCameraModalOpen: boolean;
  setIsCameraModalOpen: (open: boolean) => void;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => void;
  startCalibration: (referenceDistanceCm?: number) => void;
  cancelCalibration: () => void;
  isCalibrating: boolean;
  calibrationProgress: number; // 0 to 100
  calibrationCountdown: number; // seconds left
  proximityAlert: ProximityAlertState;
  dismissProximityAlert: () => void;
  optimalDistanceCm: number;
  setOptimalDistanceCm: (d: number) => void;
}

const defaultTelemetry: VisionTelemetry = {
  isTracking: false,
  faceDetected: false,
  ear: 0.28,
  blinksThisMinute: 16,
  rollingBlinkRate: 16,
  totalBlinks: 0,
  lastBlinkTime: null,
  estimatedDistanceCm: 43,
  isProximityAlert: false,
  headPose: { yaw: 0, pitch: 0, roll: 0 },
  fps: 0,
  isCalibrated: false,
  trackingQuality: 'High',
};

const VisionContext = createContext<VisionContextType | null>(null);

export const VisionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<VisionTelemetry>(defaultTelemetry);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [optimalDistanceCm, setOptimalDistanceCm] = useState(40);

  // Calibration states
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationCountdown, setCalibrationCountdown] = useState(5);
  const calibrationSamplesRef = useRef<{ ear: number; faceWidth: number }[]>([]);
  const calibrationRefDistance = useRef(42);

  // Proximity Alert state with cooldown to prevent spam
  const [proximityAlert, setProximityAlert] = useState<ProximityAlertState>({
    active: false,
    distanceCm: 43,
    optimalCm: 40,
  });
  const lastProximityAlertTime = useRef(0);

  // Services instances (singletons per session)
  const cameraServiceRef = useRef<CameraService | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarkerService | null>(null);
  const blinkDetectorRef = useRef<BlinkDetector | null>(null);
  const distanceEstimatorRef = useRef<DistanceEstimator | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  // Performance and rate limiting refs
  const lastUiUpdateRef = useRef(0);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now(), currentFps: 0 });
  const minuteAggregationRef = useRef<{
    startTime: number;
    blinksStart: number;
    distances: number[];
  }>({
    startTime: Date.now(),
    blinksStart: 0,
    distances: [],
  });

  // Initialize service singletons on mount
  useEffect(() => {
    cameraServiceRef.current = new CameraService((s, err) => {
      setStatus(s);
      if (err) setErrorMessage(err);
    });
    faceLandmarkerRef.current = new FaceLandmarkerService();
    blinkDetectorRef.current = new BlinkDetector();
    distanceEstimatorRef.current = new DistanceEstimator();

    const calib = distanceEstimatorRef.current.getCalibration();
    if (calib && calib.calibratedAt > 0) {
      blinkDetectorRef.current.setBaseline(calib.baselineEAR);
      setTelemetry((prev) => ({ ...prev, isCalibrated: true }));
    }

    return () => {
      // Cleanup on unmount
      isRunningRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      cameraServiceRef.current?.stop();
      faceLandmarkerRef.current?.dispose();
    };
  }, []);

  const dismissProximityAlert = useCallback(() => {
    setProximityAlert((prev) => ({ ...prev, active: false }));
  }, []);

  /**
   * Main real-time frame processing loop
   */
  const processFrame = useCallback(() => {
    if (!isRunningRef.current) return;

    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    const blinkDetector = blinkDetectorRef.current;
    const distanceEstimator = distanceEstimatorRef.current;

    if (video && landmarker && blinkDetector && distanceEstimator) {
      // 1. Calculate FPS
      const now = performance.now();
      fpsCounterRef.current.frames += 1;
      if (now - fpsCounterRef.current.lastTime >= 1000) {
        fpsCounterRef.current.currentFps = Math.round(
          (fpsCounterRef.current.frames * 1000) / (now - fpsCounterRef.current.lastTime)
        );
        fpsCounterRef.current.frames = 0;
        fpsCounterRef.current.lastTime = now;
      }

      // 2. Perform throttled inference (~12 FPS for high performance & low thermals)
      const detectionResult = landmarker.detectVideoFrame(video, 80);

      if (detectionResult) {
        const { landmarks } = detectionResult;
        const faceDetected = landmarks && landmarks.length >= 468;

        // 3. Process Blink Detection via Eye Aspect Ratio
        const blinkResult = blinkDetector.processLandmarks(faceDetected ? landmarks : null, now);

        // 4. Process Distance Estimation via Pinhole Geometry
        const distanceResult = distanceEstimator.estimateDistance(faceDetected ? landmarks : null);

        // 5. Handle Live Calibration Sampling
        if (calibrationSamplesRef.current && isCalibrating && faceDetected) {
          calibrationSamplesRef.current.push({
            ear: blinkResult.ear,
            faceWidth: distanceResult.rawWidth,
          });
        }

        // 6. Proximity Alert Check (if closer than optimalDistance, e.g. < 38cm)
        if (
          distanceResult.distanceCm !== null &&
          distanceResult.distanceCm < optimalDistanceCm &&
          distanceResult.trackingQuality !== 'Lost'
        ) {
          if (now - lastProximityAlertTime.current > 15000) { // 15-second alert cooldown
            lastProximityAlertTime.current = now;
            setProximityAlert({
              active: true,
              distanceCm: distanceResult.distanceCm,
              optimalCm: optimalDistanceCm,
            });
          }
        } else if (
          distanceResult.distanceCm !== null &&
          distanceResult.distanceCm >= optimalDistanceCm + 2
        ) {
          // Auto-clear warning when user moves back into safe zone
          setProximityAlert((prev) => (prev.active ? { ...prev, active: false } : prev));
        }

        // 7. Accumulate distances for periodic minute persistence
        if (distanceResult.distanceCm !== null) {
          minuteAggregationRef.current.distances.push(distanceResult.distanceCm);
        }

        // 8. Publish throttled UI telemetry updates (every ~200ms) to ensure smooth 60fps React UI
        if (now - lastUiUpdateRef.current >= 200) {
          lastUiUpdateRef.current = now;

          setTelemetry({
            isTracking: faceDetected,
            faceDetected,
            ear: blinkResult.ear,
            blinksThisMinute: blinkResult.rollingBlinkRate ?? 0,
            rollingBlinkRate: blinkResult.rollingBlinkRate ?? 0,
            totalBlinks: blinkResult.totalBlinks,
            lastBlinkTime: blinkResult.lastBlinkTime,
            estimatedDistanceCm: distanceResult.distanceCm,
            isProximityAlert: distanceResult.distanceCm !== null && distanceResult.distanceCm < optimalDistanceCm,
            headPose: distanceResult.headPose,
            fps: fpsCounterRef.current.currentFps,
            isCalibrated: distanceResult.isCalibrated,
            trackingQuality: distanceResult.trackingQuality,
          });
        }
      } else {
        // If no video or inference skipped, check if tracking lost
        if (now - lastUiUpdateRef.current >= 400 && landmarker.isReady()) {
          lastUiUpdateRef.current = now;
          setTelemetry((prev) => ({
            ...prev,
            fps: fpsCounterRef.current.currentFps,
          }));
        }
      }
    }

    // Continue frame loop
    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [isCalibrating, optimalDistanceCm]);

  /**
   * Start camera and MediaPipe analysis
   */
  const startMonitoring = useCallback(async () => {
    setErrorMessage(null);
    const camera = cameraServiceRef.current;
    const landmarker = faceLandmarkerRef.current;

    if (!camera || !landmarker) {
      setErrorMessage('Camera or vision services are not available.');
      return;
    }

    try {
      setStatus('requesting_permission');

      // 1. Ensure video element is available
      if (!videoRef.current) {
        // Create an offscreen video element if one wasn't attached
        const offscreenVideo = document.createElement('video');
        offscreenVideo.playsInline = true;
        offscreenVideo.muted = true;
        offscreenVideo.width = 640;
        offscreenVideo.height = 480;
        offscreenVideo.style.position = 'fixed';
        offscreenVideo.style.top = '-9999px';
        offscreenVideo.style.left = '-9999px';
        offscreenVideo.style.opacity = '0';
        offscreenVideo.style.pointerEvents = 'none';
        document.body.appendChild(offscreenVideo);
        videoRef.current = offscreenVideo;
      }

      // 2. Start camera hardware
      await camera.start(videoRef.current);

      // 3. Initialize MediaPipe FaceLandmarker model in parallel or sequence
      setStatus('initializing');
      await landmarker.initialize();

      // 4. Start analysis loop
      isRunningRef.current = true;
      setStatus('running');
      animationFrameRef.current = requestAnimationFrame(processFrame);
    } catch (err) {
      isRunningRef.current = false;
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setErrorMessage(msg);
    }
  }, [processFrame]);

  /**
   * Stop camera and analysis
   */
  const stopMonitoring = useCallback(() => {
    isRunningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    cameraServiceRef.current?.stop();
    setStatus('idle');
    setTelemetry((prev) => ({
      ...prev,
      isTracking: false,
      faceDetected: false,
      fps: 0,
      trackingQuality: 'Lost',
    }));
  }, []);

  /**
   * Periodic 60-second aggregate logging for privacy-preserving persistence
   */
  useEffect(() => {
    if (status !== 'running') return;

    const interval = setInterval(() => {
      const now = Date.now();
      const detector = blinkDetectorRef.current;
      if (!detector) return;

      const blinksNow = detector.getTotalBlinks();
      const blinksInMinute = Math.max(0, blinksNow - minuteAggregationRef.current.blinksStart);
      const distances = minuteAggregationRef.current.distances;
      const avgDist = distances.length > 0 ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : 42;

      TelemetryStorageService.saveBucket({
        timestamp: now,
        timeLabel: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        durationSeconds: 60,
        blinksDetected: blinksInMinute,
        avgBlinkRate: detector.getRollingBlinkRate() ?? 0,
        avgDistanceCm: avgDist,
        proximityAlertsCount: avgDist < optimalDistanceCm ? 1 : 0,
        trackingQualityPct: distances.length > 10 ? 95 : 50,
      });

      minuteAggregationRef.current = {
        startTime: now,
        blinksStart: blinksNow,
        distances: [],
      };
    }, 60000);

    return () => clearInterval(interval);
  }, [status, optimalDistanceCm]);

  /**
   * Calibration controller (5-second stable baseline capture)
   */
  const startCalibration = useCallback(
    (referenceDistanceCm = 42) => {
      if (status !== 'running') {
        startMonitoring().then(() => {
          setIsCalibrating(true);
        });
      } else {
        setIsCalibrating(true);
      }

      calibrationRefDistance.current = referenceDistanceCm;
      calibrationSamplesRef.current = [];
      setCalibrationProgress(0);
      setCalibrationCountdown(5);

      const startTime = performance.now();
      const DURATION = 5000;

      const timer = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(100, Math.round((elapsed / DURATION) * 100));
        const secondsLeft = Math.max(0, Math.ceil((DURATION - elapsed) / 1000));

        setCalibrationProgress(progress);
        setCalibrationCountdown(secondsLeft);

        if (elapsed >= DURATION) {
          clearInterval(timer);
          setIsCalibrating(false);

          // Calculate average baseline values from valid samples
          const samples = calibrationSamplesRef.current;
          if (samples.length >= 8) {
            const validEars = samples.map((s) => s.ear).filter((e) => e > 0.15 && e < 0.5);
            const validWidths = samples.map((s) => s.faceWidth).filter((w) => w > 0.1 && w < 0.8);

            const avgEAR = validEars.length > 0 ? validEars.reduce((a, b) => a + b, 0) / validEars.length : 0.28;
            const avgWidth = validWidths.length > 0 ? validWidths.reduce((a, b) => a + b, 0) / validWidths.length : 0.32;

            distanceEstimatorRef.current?.saveCalibration(avgEAR, avgWidth, calibrationRefDistance.current);
            blinkDetectorRef.current?.setBaseline(avgEAR);

            setTelemetry((prev) => ({ ...prev, isCalibrated: true }));
          }
        }
      }, 100);
    },
    [status, startMonitoring]
  );

  const cancelCalibration = useCallback(() => {
    setIsCalibrating(false);
    setCalibrationProgress(0);
    calibrationSamplesRef.current = [];
  }, []);

  return (
    <VisionContext.Provider
      value={{
        status,
        errorMessage,
        telemetry,
        videoRef,
        isCameraModalOpen,
        setIsCameraModalOpen,
        startMonitoring,
        stopMonitoring,
        startCalibration,
        cancelCalibration,
        isCalibrating,
        calibrationProgress,
        calibrationCountdown,
        proximityAlert,
        dismissProximityAlert,
        optimalDistanceCm,
        setOptimalDistanceCm,
      }}
    >
      {children}
    </VisionContext.Provider>
  );
};

export const useVision = (): VisionContextType => {
  const context = useContext(VisionContext);
  if (!context) {
    throw new Error('useVision must be used within a VisionProvider');
  }
  return context;
};
