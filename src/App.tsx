import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play } from 'lucide-react';
import {
  ActiveTab,
  BehaviorMode,
  EyeBreakLog,
  OnboardingStep,
  TelemetryState,
  MonitoringState,
  EyeDetectionState,
} from './types';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardScreen } from './components/DashboardScreen';
import { OcureScreen } from './components/OcureScreen';
import { RetisScreen } from './components/RetisScreen';
import { SessionLogsScreen } from './components/SessionLogsScreen';
import { PreferencesModal } from './components/PreferencesModal';
import { DistanceCalibrationModal } from './components/DistanceCalibrationModal';
import { BlinkDebugModal } from './components/BlinkDebugModal';
import { CameraCompatibilityPanel } from './components/CameraCompatibilityPanel';
import { IrisEntrancePortal } from './components/IrisEntrancePortal';
import { MacTitleBar } from './components/MacTitleBar';
import { IrisOnboardingFlow } from './components/IrisOnboardingFlow';
import { IrisOnboardingDocsModal } from './components/IrisOnboardingDocsModal';
import { StyleChooserScreen } from './components/StyleChooserScreen';
import { useTheme } from './context/ThemeContext';
import { auth, logOut, User } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useCamera, CameraService } from './services/cameraService';
import { FaceLandmarkerService } from './services/faceLandmarkerService';
import { BlinkDetector } from './services/blinkDetector';
import { DistanceEstimator } from './services/distanceEstimator';
import { TelemetryStorageService } from './services/telemetryStorage';
import {
  OcureDailyPlanService,
  classifyBlinkRate,
  selectNextRoutine,
  RoutineRecord,
  OCURE_CONFIG,
  getLocalDateOrdinal,
  extractExerciseMotionFeatures,
  getStoredCameraCheckPref,
} from './services/ocureService';
import {
  OnboardingSetupStorage,
  PersistedCalibrationMetadata,
} from './services/onboardingVisionService';
import { LiveTelemetryStore } from './services/retisSnapshot';

export default function App() {
  const { styleMode, isDark, confirmStyleSelection, isStyleChooserOpen } = useTheme();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isCameraPanelOpen, setIsCameraPanelOpen] = useState(false);
  const [isGlassesMode, setIsGlassesMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('iris_glasses_mode_enabled') === 'true';
    } catch {
      return false;
    }
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // OCURE Coach session state & scheduled break offer state
  const [isOcureSessionActive, setIsOcureSessionActive] = useState(false);
  const isOcureSessionActiveRef = useRef(false);
  const [scheduledBreakOffer, setScheduledBreakOffer] = useState<RoutineRecord | null>(null);
  const [ocureTargetRoutineId, setOcureTargetRoutineId] = useState<string>('R1');

  // Mandatory Onboarding & Recovery Gating State
  const initialRoute = OnboardingSetupStorage.resolveStartupRoute(
    CameraService.hasStoredPermission() ? 'granted' : 'prompt'
  );
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(
    !initialRoute.requiresOnboarding
  );
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<OnboardingStep>(
    initialRoute.initialStep
  );
  const [onboardingRecoveryReason, setOnboardingRecoveryReason] = useState<string | undefined>(
    initialRoute.recoveryReason
  );
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);

  // Preferences configuration
  const [breakIntervalMinutes, setBreakIntervalMinutes] = useState(20);
  const [audioAlerts, setAudioAlerts] = useState(true);
  const [postureSensitivity, setPostureSensitivity] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [widgetDesign, setWidgetDesign] = useState<'liquid-glass' | 'dark-vivid'>(() => {
    try {
      const saved = localStorage.getItem('iris_pupil_widget_design');
      if (saved === 'liquid-glass' || saved === 'dark-vivid') return saved;
    } catch {}
    return 'dark-vivid';
  });
  const [modeNotice, setModeNotice] = useState<{ message: string; type: 'warning' | 'info' } | null>(null);
  const modeNoticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleChangeWidgetDesign = useCallback((design: 'liquid-glass' | 'dark-vivid') => {
    setWidgetDesign(design);
    try {
      localStorage.setItem('iris_pupil_widget_design', design);
    } catch {}
    window.irisNative?.setWidgetDesign?.(design);
  }, []);

  const distanceEstimatorRef = useRef(new DistanceEstimator());
  const blinkDetectorRef = useRef(new BlinkDetector());
  const exerciseBlinkDetectorRef = useRef(new BlinkDetector());
  const landmarkerServiceRef = useRef(new FaceLandmarkerService());
  const postureSensitivityRef = useRef(postureSensitivity);
  useEffect(() => {
    postureSensitivityRef.current = postureSensitivity;
  }, [postureSensitivity]);

  useEffect(() => {
    isOcureSessionActiveRef.current = isOcureSessionActive;
  }, [isOcureSessionActive]);

  const latestLandmarksRef = useRef<any>(null);
  const validObservationSecondsRef = useRef(0);
  const totalMonitoringSecondsRef = useRef(0);
  const lastValidFrameTimeRef = useRef(performance.now());
  const sessionStartTimeRef = useRef(performance.now());
  const lastRecordTimeRef = useRef(0);
  const lastProximityWarningRef = useRef(0);
  const lastLockinWarningRef = useRef(0);
  const isDocumentHiddenRef = useRef(false);
  const sustainedProximityStartMsRef = useRef<number | null>(null);
  const lastEmittedBlinkCountRef = useRef<number>(0);
  const lastWidgetTelemetrySyncMsRef = useRef<number>(0);

  // Persistent rolling telemetry window buffer (seeded from recent SQLite/local record)
  const initialHistoryRecord = (TelemetryStorageService.getRecords()[0] as any) || (TelemetryStorageService.getLiveSamples().slice(-1)[0] as any);
  const initialSeedBlink = Number(initialHistoryRecord?.avgBlinkRate || initialHistoryRecord?.blinkRate || 15);
  const initialSeedDist = Number(initialHistoryRecord?.avgDistanceCm || initialHistoryRecord?.distanceCm || 52);
  const lastKnownBlinkRateRef = useRef<number>(initialSeedBlink);
  const lastKnownDistanceCmRef = useRef<number>(initialSeedDist);

  // Proximity and blink targets reactivity refs
  const rawTooCloseStartMsRef = useRef<number | null>(null);
  const rawNormalDistanceStartMsRef = useRef<number | null>(null);
  const isTooCloseRef = useRef<boolean>(false);
  const lastBlinkCompletionGraceMsRef = useRef<number>(0);
  const isBlinkChallengeActiveRef = useRef<boolean>(false);

  useEffect(() => {
    const unsubChallenge = window.irisNative?.onBlinkChallengeCompleted?.(() => {
      lastBlinkCompletionGraceMsRef.current = Date.now();
      blinkDetectorRef.current?.resetTransientState?.();
    });
    return () => {
      if (unsubChallenge) unsubChallenge();
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        isDocumentHiddenRef.current = true;
      } else {
        isDocumentHiddenRef.current = false;
        lastValidFrameTimeRef.current = performance.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Sync historical local telemetry records with the SQLite database
  useEffect(() => {
    TelemetryStorageService.syncLocalToDatabase().catch(() => {});
  }, []);

  // Synchronize initial mode, send initial seeded telemetry, and listen for widget mode updates
  useEffect(() => {
    window.irisNative?.sendLiveTelemetry?.({
      blinkRate: lastKnownBlinkRateRef.current,
      screenDistance: lastKnownDistanceCmRef.current,
      isTracking: true,
      faceDetected: true,
      fatigueScore: 1.0,
      activeMode: telemetry.activeMode,
    });

    window.irisNative?.getWidgetState?.().then((state) => {
      if (state?.activeMode) {
        setTelemetry((prev) => prev.activeMode === state.activeMode ? prev : ({
          ...prev,
          activeMode: state.activeMode,
          distanceOptimal: state.activeMode === 'gaming' ? 35 : state.activeMode === 'meeting' ? 45 : 40,
        }));
      }
    }).catch(() => {});

    window.irisNative?.getModeState?.().then((mState) => {
      if (mState?.currentActiveMode) {
        setTelemetry((prev) => ({
          ...prev,
          activeMode: mState.currentActiveMode,
          isManualModeOverride: Boolean(mState.isManualModeOverride),
          distanceOptimal: mState.currentActiveMode === 'gaming' ? 35 : mState.currentActiveMode === 'meeting' ? 45 : 40,
        }));
      }
    }).catch(() => {});

    const unsubWidget = window.irisNative?.onWidgetStateUpdate?.((state) => {
      if (state?.activeMode) {
        setTelemetry((prev) => prev.activeMode === state.activeMode ? prev : ({
          ...prev,
          activeMode: state.activeMode,
          distanceOptimal: state.activeMode === 'gaming' ? 35 : state.activeMode === 'meeting' ? 45 : 40,
        }));
      }
      if (state?.widgetDesign === 'liquid-glass' || state?.widgetDesign === 'dark-vivid') {
        setWidgetDesign(state.widgetDesign);
        try {
          localStorage.setItem('iris_pupil_widget_design', state.widgetDesign);
        } catch {}
      }
    });

    const unsubDesign = window.irisNative?.onWidgetDesignUpdate?.((design) => {
      if (design === 'liquid-glass' || design === 'dark-vivid') {
        setWidgetDesign(design);
        try {
          localStorage.setItem('iris_pupil_widget_design', design);
        } catch {}
      }
    });

    return () => {
      if (unsubWidget) unsubWidget();
      if (unsubDesign) unsubDesign();
    };
  }, []);

  // Initialize verified logs from storage without injecting any mock seed records
  const [logs, setLogs] = useState<EyeBreakLog[]>(() => {
    return TelemetryStorageService.getSessionLogs();
  });

  // Check if an eye break/alert log occurred today
  const isLogFromToday = (l: EyeBreakLog): boolean => {
    if (!l.id) return false;
    const match = l.id.match(/\d{10,}/);
    if (match) {
      const ts = Number(match[0]);
      if (!isNaN(ts) && ts > 1600000000000) {
        const logDate = new Date(ts);
        const today = new Date();
        return (
          logDate.getFullYear() === today.getFullYear() &&
          logDate.getMonth() === today.getMonth() &&
          logDate.getDate() === today.getDate()
        );
      }
    }
    return false;
  };

  // Calculate real day progress from actual completed break records
  const completedBreaksCount = Math.min(
    OCURE_CONFIG.MAX_DAILY_BREAKS,
    Math.max(
      OcureDailyPlanService.getCompletedBreaksTodayCount(),
      logs.filter(
        (l) =>
          isLogFromToday(l) &&
          l.status === 'Completed' &&
          (l.type.toLowerCase().includes('break') || l.type.toLowerCase().includes('routine'))
      ).length
    )
  );
  const initialDayProgress = Math.min(100, Math.round((completedBreaksCount / OCURE_CONFIG.MAX_DAILY_BREAKS) * 100));

  // Core Telemetry State: initialized with today's verified live samples or calibrated reference baseline
  const isInitiallyCalibrated = distanceEstimatorRef.current.isUserCalibrated();
  const initialDistanceAlerts = isInitiallyCalibrated
    ? logs.filter((l) => isLogFromToday(l) && (l.type.includes('Proximity') || l.type.includes('Distance'))).length
    : 0;
  const initialThresholds = blinkDetectorRef.current.getThresholds();
  const [telemetry, setTelemetry] = useState<TelemetryState>(() => {
    const todaySamples = TelemetryStorageService.getLiveSamples().filter((s) => {
      const d = new Date(s.timestamp);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });
    const latestBlinkSample = [...todaySamples]
      .reverse()
      .find((s) => Number.isFinite(s.blinkRate) && s.blinkRate > 0);
    const latestDistSample = [...todaySamples]
      .reverse()
      .find((s) => Number.isFinite(s.distanceCm) && s.distanceCm >= 15 && s.distanceCm <= 120);
    const initialBlinkRate = latestBlinkSample ? Math.round(latestBlinkSample.blinkRate) : null;
    const initialScreenDistance = latestDistSample
      ? Math.round(latestDistSample.distanceCm)
      : isInitiallyCalibrated
      ? Math.round(distanceEstimatorRef.current.getReferenceDistance())
      : null;

    return {
      avgBlinkRate: initialBlinkRate,
      rollingBlinkRate: null,
      blinkTargetMin: 14,
      blinkTargetMax: 18,
      avgScreenDistance: initialScreenDistance,
      distanceOptimal: 45,
      vergenceStatus: 'UNKNOWN',
      dayProgress: initialDayProgress,
      fatigueScore: null,
    dayCount: 1,
    activeMode: 'default',
    gazePointsAudited: 0,
    blinkAlerts: logs.filter((l) => isLogFromToday(l) && (l.type.includes('Lock-in') || l.type.includes('Blink'))).length,
    distanceAlerts: initialDistanceAlerts,
    screenTimeHours: 0,
    longestSessionHours: 0,
    cameraFps: 0,
    nextBreakSeconds: breakIntervalMinutes * 60,
    isCalibrated: isInitiallyCalibrated,
    isMonitoring: false,
    faceDetected: false,
    isReliable: false,
    observationSeconds: 0,
    totalMonitoringSeconds: 0,
    trackingCoveragePct: 100,
    totalBlinksDetected: 0,
    fullBlinksDetected: 0,
    partialBlinksDetected: 0,
    leftEyeAperture: initialThresholds.baselineEAR,
    rightEyeAperture: initialThresholds.baselineEAR,
    combinedAperture: initialThresholds.baselineEAR,
    baselineAperture: initialThresholds.baselineEAR,
    closureThresholdEAR: initialThresholds.closureThresholdEAR,
    reopenThresholdEAR: initialThresholds.reopenThresholdEAR,
    fullClosureThresholdEAR: initialThresholds.fullClosureThresholdEAR,
    eyeClosureScore: 0,
    blinkState: 'OPEN',
    blinkConfidence: 1.0,
    lastBlinkTimestamp: null,
      trackingQuality: 'High',
      headPose: { yaw: 0, pitch: 0, roll: 0 },
      candidateLogs: [],
    };
  });

  const telemetryRef = useRef(telemetry);
  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);
  const autoStartAttemptedRef = useRef(false);

  const handleSessionStateChange = useCallback((isActive: boolean) => {
    if (isActive) {
      exerciseBlinkDetectorRef.current.setBaseline(
        blinkDetectorRef.current.getThresholds().baselineEAR
      );
      exerciseBlinkDetectorRef.current.resetTransientState();
      blinkDetectorRef.current.resetTransientState();
    }
    isOcureSessionActiveRef.current = isActive;
    setIsOcureSessionActive((prev) => (prev !== isActive ? isActive : prev));
  }, []);

  // Real Camera Monitoring Lifecycle State
  const [isMonitoring, setIsMonitoring] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const {
    status: cameraStatus,
    permissionState: cameraPermissionState,
    error: cameraError,
    diagnostics: cameraDiagnostics,
    startCamera,
    stopCamera,
    resetRecovery,
    setMeetingYieldActive,
    setConcurrentAppName,
  } = useCamera({ keepAliveOnUnmount: true });

  // Sync glasses mode setting with detectors and telemetry
  useEffect(() => {
    blinkDetectorRef.current.setGlassesMode(isGlassesMode);
    exerciseBlinkDetectorRef.current.setGlassesMode(isGlassesMode);
    try {
      localStorage.setItem('iris_glasses_mode_enabled', String(isGlassesMode));
    } catch {}
    setTelemetry((prev) => ({
      ...prev,
      isGlassesMode,
      cameraDiagnostics,
    }));
  }, [isGlassesMode, cameraDiagnostics]);

  const monitoringState: MonitoringState = (() => {
    if (cameraDiagnostics.cameraMode === 'STANDBY_LOCKED') {
      return 'CAMERA_BUSY';
    }
    if (cameraStatus === 'requesting_permission' || cameraStatus === 'initializing') {
      return 'STARTING';
    }
    if (cameraStatus === 'error') {
      const err = (cameraError || '').toLowerCase();
      if (
        err.includes('in use') ||
        err.includes('another application') ||
        cameraPermissionState === 'Camera in use by another application'
      ) {
        return 'CAMERA_BUSY';
      }
      if (
        err.includes('denied') ||
        err.includes('blocked') ||
        cameraPermissionState === 'Camera blocked' ||
        cameraPermissionState === 'Permission denied'
      ) {
        return 'CAMERA_BLOCKED';
      }
      return 'ERROR';
    }
    if (!isMonitoring) {
      return 'PAUSED';
    }
    if (!telemetry.faceDetected) {
      return 'NO_FACE';
    }
    return 'ACTIVE';
  })();

  const eyeDetectionState: EyeDetectionState = (() => {
    if (cameraDiagnostics.cameraMode === 'STANDBY_LOCKED') {
      return 'Detection unavailable';
    }
    if (!isMonitoring || cameraStatus !== 'running') {
      return 'Detection unavailable';
    }
    if (!telemetry.faceDetected) {
      return 'Eyes not detected';
    }
    if (telemetry.faceObscured) {
      return 'Detection unavailable';
    }
    if (telemetry.isReliable) {
      return 'Eyes detected';
    }
    return 'Eyes not detected';
  })();

  useEffect(() => {
    LiveTelemetryStore.update(telemetry, isMonitoring, cameraStatus, cameraError);
  }, [telemetry, isMonitoring, cameraStatus, cameraError]);

  // Verify setup validity and browser camera permission for returning users on sign-in
  // Note: Does NOT auto-start continuous monitoring; completing calibration and starting monitoring are separate actions.
  useEffect(() => {
    let isCancelled = false;

    const verifyReturningUserSetup = async () => {
      const browserPerm = await CameraService.checkBrowserPermission();
      if (isCancelled) return;

      if (browserPerm === 'denied') {
        OnboardingSetupStorage.markCameraPermissionGranted(false);
      }

      const route = OnboardingSetupStorage.resolveStartupRoute(browserPerm);
      setOnboardingInitialStep(route.initialStep);
      setOnboardingRecoveryReason(route.recoveryReason);
      setHasCompletedOnboarding(!route.requiresOnboarding);
    };

    if (currentUser) {
      verifyReturningUserSetup();
    }

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  // Calibration action handler using actual facial landmark measurements or manual reference input
  const handleCalibrateDistance = useCallback((refDistance = 48) => {
    let ok = false;
    if (latestLandmarksRef.current && isMonitoring) {
      ok = distanceEstimatorRef.current.calibrateFromLandmarks(latestLandmarksRef.current, refDistance);
    }
    if (!ok) {
      distanceEstimatorRef.current.manualSetDistance(refDistance);
      ok = true;
    }

    if (ok) {
      setTelemetry((prev) => ({
        ...prev,
        isCalibrated: true,
        avgScreenDistance: refDistance,
      }));
      const calibLog: EyeBreakLog = {
        id: `calib-${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'Position Calibration Stored',
        durationSeconds: 0,
        complianceScore: 100,
        status: 'Completed',
        telemetrySnapshot: {
          blinkRate: telemetry.avgBlinkRate,
          distanceCm: refDistance,
          fatigueScore: telemetry.fatigueScore,
        },
        notes: 'Reference positioning baseline calibrated and saved locally.',
      };
      setLogs((current) => TelemetryStorageService.addSessionLog(calibLog));
    }
    return ok;
  }, [isMonitoring, telemetry.avgBlinkRate, telemetry.fatigueScore]);

  // Reset distance calibration: invalidates calibration and triggers recalibration recovery step
  const handleResetCalibration = useCallback(() => {
    distanceEstimatorRef.current.clearCalibration();
    OnboardingSetupStorage.invalidateCalibration();
    setTelemetry((prev) => ({
      ...prev,
      isCalibrated: false,
      avgScreenDistance: null,
    }));
    setOnboardingInitialStep('facePositioning');
    setOnboardingRecoveryReason(
      'Your calibration was reset. Please confirm your face and eye alignment to save a new reference position.'
    );
    setHasCompletedOnboarding(false);
    const resetLog: EyeBreakLog = {
      id: `calib-reset-${Date.now()}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'Position Calibration Reset',
      durationSeconds: 0,
      complianceScore: 100,
      status: 'Completed',
      telemetrySnapshot: {
        blinkRate: telemetry.avgBlinkRate,
        distanceCm: null,
        fatigueScore: telemetry.fatigueScore,
      },
      notes: 'Position calibration invalidated. Recalibration requested.',
    };
    setLogs((current) => TelemetryStorageService.addSessionLog(resetLog));
  }, [telemetry.avgBlinkRate, telemetry.fatigueScore]);

  // User intentional stop guard: prevents auto-monitoring from overriding explicit user pause
  const userStoppedMonitoringRef = useRef(false);

  // Dedicated function to start continuous webcam eye monitoring
  const startMonitoring = useCallback(async () => {
    if (isMonitoring) {
      return;
    }
    if (!videoRef.current) return;
    try {
      const activeStream = await startCamera(videoRef.current);
      if (videoRef.current && activeStream && videoRef.current.srcObject !== activeStream) {
        videoRef.current.srcObject = activeStream;
      }
      if (videoRef.current && videoRef.current.paused) {
        await videoRef.current.play().catch(() => {});
      }
      blinkDetectorRef.current.resetTransientState();
      sessionStartTimeRef.current = performance.now();
      lastValidFrameTimeRef.current = performance.now();
      sustainedProximityStartMsRef.current = null;

      setIsMonitoring(true);

      setTelemetry((prev) => ({
        ...prev,
        isMonitoring: true,
        blinkState: 'OPEN',
      }));

      const currentTel = telemetryRef.current;
      const startLog: EyeBreakLog = {
        id: `cam-start-${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'Live Webcam Tracking Active',
        durationSeconds: 0,
        complianceScore: 100,
        status: 'Active',
        telemetrySnapshot: {
          blinkRate: currentTel.avgBlinkRate,
          distanceCm: currentTel.avgScreenDistance,
          fatigueScore: currentTel.fatigueScore,
        },
        notes: 'Camera monitoring active: face and eye landmarks detecting real blinks and distance.',
      };
      setLogs((prev) => TelemetryStorageService.addSessionLog(startLog));
    } catch (err) {
      console.warn('Start camera monitoring encountered error:', err);
      if (cameraDiagnostics.cameraMode !== 'RECOVERING') {
        userStoppedMonitoringRef.current = true;
      }
      setIsMonitoring(false);
      setTelemetry((prev) => ({
        ...prev,
        isMonitoring: false,
      }));
    }
  }, [isMonitoring, startCamera]);

  // Dedicated function to stop continuous webcam eye monitoring
  const stopMonitoring = useCallback(() => {
    const elapsedSeconds = Math.round((performance.now() - sessionStartTimeRef.current) / 1000);
    stopCamera();
    blinkDetectorRef.current.resetTransientState();
    sustainedProximityStartMsRef.current = null;
    setIsMonitoring(false);

    if (elapsedSeconds >= 10) {
      const stopLog: EyeBreakLog = {
        id: `cam-session-${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'Webcam Eye-Tracking Audit',
        durationSeconds: elapsedSeconds,
        complianceScore: 100,
        status: 'Completed',
        telemetrySnapshot: {
          blinkRate: telemetry.avgBlinkRate,
          distanceCm: telemetry.avgScreenDistance,
          fatigueScore: telemetry.fatigueScore,
        },
        notes: `Session finished. Recorded ${telemetry.gazePointsAudited.toLocaleString()} frames and ${telemetry.totalBlinksDetected} blinks over ${Math.round(validObservationSecondsRef.current)}s observation.`,
      };
      setLogs((prev) => TelemetryStorageService.addSessionLog(stopLog));
    }

    setTelemetry((prev) => ({
      ...prev,
      isMonitoring: false,
      cameraFps: 0,
      faceDetected: false,
      isReliable: false,
      avgScreenDistance: null,
      blinkState: 'OPEN',
      trackingQuality: 'Lost',
    }));
  }, [stopCamera, telemetry]);

  // Toggle monitoring handler triggered from dashboard or UI controls
  const handleToggleMonitoring = useCallback(async () => {
    if (isMonitoring) {
      userStoppedMonitoringRef.current = true;
      stopMonitoring();
    } else {
      userStoppedMonitoringRef.current = false;
      await startMonitoring();
    }
  }, [isMonitoring, startMonitoring, stopMonitoring]);

  // Open break session handler for sidebar, dashboard, and daily plan triggers
  const handleOpenBreakSession = useCallback(
    async (routineId?: string) => {
      if (routineId) {
        setOcureTargetRoutineId(routineId);
      }
      setActiveTab('ocure');
      if (!isMonitoring && getStoredCameraCheckPref()) {
        userStoppedMonitoringRef.current = false;
        await startMonitoring();
      }
    },
    [isMonitoring, startMonitoring]
  );

  // Intelligent Meeting Mode & Concurrent Camera Handshake (Windows Frame Server Shared Mode)
  useEffect(() => {
    const unsubYield = window.irisNative?.onMeetingCameraYield?.((data) => {
      const activeMeeting =
        data && typeof data === 'object' && 'activeMeetingName' in data
          ? (data as any).activeMeetingName
          : 'Video Meeting';
      setConcurrentAppName(activeMeeting);
      setModeNotice({
        message: `IRIS operating in Windows Shared Camera mode alongside ${activeMeeting}.`,
        type: 'info',
      });
      if (modeNoticeTimerRef.current) clearTimeout(modeNoticeTimerRef.current);
      modeNoticeTimerRef.current = setTimeout(() => {
        setModeNotice(null);
      }, 5000);
    });

    const unsubConcurrent = window.irisNative?.onConcurrentCameraApp?.((info) => {
      const appName = info?.appName || info?.activeMeetingName || 'External Camera App';
      setConcurrentAppName(appName);
      setModeNotice({
        message: `Camera sharing active with ${appName} (Windows Frame Server).`,
        type: 'info',
      });
      if (modeNoticeTimerRef.current) clearTimeout(modeNoticeTimerRef.current);
      modeNoticeTimerRef.current = setTimeout(() => {
        setModeNotice(null);
      }, 5000);
    });

    const unsubConcurrentCleared = window.irisNative?.onConcurrentCameraAppCleared?.(() => {
      setConcurrentAppName(null);
    });

    const unsubResume = window.irisNative?.onResumeCameraMonitoring?.(async () => {
      setConcurrentAppName(null);
      setMeetingYieldActive(false);
      resetRecovery();

      // Auto-resume only if monitoring was paused
      if (!userStoppedMonitoringRef.current && !isMonitoring) {
        await startMonitoring();
      }
    });

    return () => {
      if (unsubYield) unsubYield();
      if (unsubConcurrent) unsubConcurrent();
      if (unsubConcurrentCleared) unsubConcurrentCleared();
      if (unsubResume) unsubResume();
    };
  }, [isMonitoring, startMonitoring, setMeetingYieldActive, setConcurrentAppName, resetRecovery]);

  // Auto-monitoring on app startup/begin: as soon as the app starts up or begins,
  // automatically open the camera and start monitoring the eyes without waiting for user click.
  // In desktop daemon / hidden boot mode, begins background eye awareness immediately.
  useEffect(() => {
    const isDesktop = typeof window !== 'undefined' && Boolean((window as any).irisNative?.isDesktop);
    const isDesktopHidden =
      typeof window !== 'undefined' && Boolean((window as any).irisNative?.isStartedHidden?.());

    if (userStoppedMonitoringRef.current || isMonitoring) {
      return;
    }

    if (
      (currentUser || isDesktop || isDesktopHidden) &&
      hasCompletedOnboarding &&
      !isOnboardingOpen &&
      !isStyleChooserOpen &&
      cameraStatus !== 'requesting_permission' &&
      cameraStatus !== 'error'
    ) {
      const attemptAutoStart = () => {
        if (userStoppedMonitoringRef.current || isMonitoring) return;
        if (videoRef.current) {
          startMonitoring().catch(() => {});
        }
      };

      const timer = setTimeout(attemptAutoStart, isDesktopHidden ? 50 : 200);
      const interval = setInterval(() => {
        if (userStoppedMonitoringRef.current || isMonitoring) {
          clearInterval(interval);
          return;
        }
        if (videoRef.current) {
          attemptAutoStart();
          clearInterval(interval);
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [
    currentUser,
    hasCompletedOnboarding,
    isOnboardingOpen,
    isStyleChooserOpen,
    isMonitoring,
    cameraStatus,
    startMonitoring,
  ]);

  // Real-time Computer Vision Processing Loop (MediaPipe + Blink + Distance)
  useEffect(() => {
    if (!isMonitoring || !hasCompletedOnboarding || isOnboardingOpen) {
      blinkDetectorRef.current.resetTransientState();
      return;
    }

    let animationFrameId: number | null = null;
    let loopTimerId: any = null;
    let isCancelled = false;
    let lastProcessedVideoTime = -1;
    let lastInferenceTime = 0;
    let consecutiveMissedFrames = 0;

    const landmarkerService = landmarkerServiceRef.current;
    const blinkDetector = blinkDetectorRef.current;
    const distanceEstimator = distanceEstimatorRef.current;

    blinkDetector.resetTransientState();
    lastValidFrameTimeRef.current = performance.now();

    const scheduleNextIteration = (loopFn: () => void) => {
      if (isCancelled) return;
      // Dedicated unthrottled 25 FPS (~40ms) ticker ensures blink detection works continuously whether mainWindow is hidden or visible
      loopTimerId = setTimeout(loopFn, 40);
    };

    const initAndRun = async () => {
      try {
        await landmarkerService.initialize();
      } catch (err) {
        console.warn('Failed to initialize MediaPipe FaceLandmarker:', err);
        return;
      }

      let frameCount = 0;
      let lastFpsTime = performance.now();
      lastValidFrameTimeRef.current = performance.now();

      const processLoop = () => {
        if (isCancelled) return;
        const isHidden = Boolean(
          isDocumentHiddenRef.current || (typeof document !== 'undefined' && document.hidden)
        );

        const videoEl = videoRef.current;
        const activeStream = CameraService.getInstance().getStream();
        if (videoEl && activeStream && videoEl.srcObject !== activeStream) {
          videoEl.srcObject = activeStream;
          videoEl.play().catch(() => {});
        }

        if (
          videoEl &&
          landmarkerService.isReady() &&
          videoEl.readyState >= 2 &&
          videoEl.videoWidth > 0 &&
          videoEl.videoHeight > 0
        ) {
          const nowTime = performance.now();
          const currentVideoTime = videoEl.currentTime;
          // Smooth 24-26 FPS (~38ms interval) guarantees continuous blink detection without dropped frames
          const minFrameInterval = 38;
          const isNewFrame =
            Math.abs(currentVideoTime - lastProcessedVideoTime) > 0.0001 ||
            nowTime - lastInferenceTime >= minFrameInterval;

          if (!isNewFrame) {
            scheduleNextIteration(processLoop);
            return;
          }

          lastProcessedVideoTime = currentVideoTime;
          lastInferenceTime = nowTime;

          // During active OCURE exercise sessions:
          // Process landmarks read-only for Camera Check (presence, blinks, closure, head turn) using exerciseBlinkDetectorRef,
          // while strictly excluding exercise intervals from baseline monitoring statistics (both numerator and denominator) & alerts.
          if (isOcureSessionActiveRef.current) {
            lastValidFrameTimeRef.current = nowTime;
            // Privacy guard: if the user disabled camera check for OCURE exercises, do not process frames
            if (!getStoredCameraCheckPref()) {
              scheduleNextIteration(processLoop);
              return;
            }
            const detection = landmarkerService.detectVideoFrame(videoEl, 0);
            if (detection && detection.landmarks && detection.landmarks.length >= 468) {
              consecutiveMissedFrames = 0;
              latestLandmarksRef.current = detection.landmarks;
              const now = detection.timestamp;
              const distanceResult = distanceEstimator.estimateDistance(detection.landmarks);
              const blinkResult = exerciseBlinkDetectorRef.current.processLandmarks(
                detection.landmarks,
                now,
                detection.blendshapes,
                distanceResult.headPose,
                validObservationSecondsRef.current
              );
              const motionFeatures = extractExerciseMotionFeatures(
                detection.landmarks,
                detection.blendshapes,
                distanceResult.headPose
              );

              frameCount++;
              if (nowTime - lastFpsTime >= 1000) {
                const fps = Math.round((frameCount * 1000) / (nowTime - lastFpsTime));
                setTelemetry((prev) => ({
                  ...prev,
                  cameraFps: fps,
                }));
                frameCount = 0;
                lastFpsTime = nowTime;
              }

              setTelemetry((prev) => ({
                ...prev,
                faceDetected: true,
                isReliable: blinkResult.isReliable,
                trackingQuality: blinkResult.trackingQuality,
                headPose: distanceResult.headPose,
                gazeHorizontal: motionFeatures.gazeHorizontal,
                gazeVertical: motionFeatures.gazeVertical,
                postureY: motionFeatures.postureY,
                jawRelaxScore: motionFeatures.jawRelaxScore,
                browTensionScore: motionFeatures.browTensionScore,
                faceObscured: motionFeatures.faceObscured,
                eyeClosureScore: blinkResult.eyeClosureScore,
                blinkState: blinkResult.state,
                leftEyeAperture: blinkResult.leftEyeOpening,
                rightEyeAperture: blinkResult.rightEyeOpening,
                combinedAperture: blinkResult.combinedOpening,
                closureThresholdEAR: blinkResult.closureThresholdEAR,
                reopenThresholdEAR: blinkResult.reopenThresholdEAR,
                ear: blinkResult.combinedOpening,
                lastBlinkTimestamp: blinkResult.isBlinkEvent ? now : prev.lastBlinkTimestamp,
              }));
            } else {
              consecutiveMissedFrames += 1;
              if (consecutiveMissedFrames >= 3) {
                exerciseBlinkDetectorRef.current.resetTransientState();
                setTelemetry((prev) => ({
                  ...prev,
                  faceDetected: false,
                  isReliable: false,
                  blinkState: 'OPEN',
                  trackingQuality: 'Lost',
                }));
              }
            }
            scheduleNextIteration(processLoop);
            return;
          }

          const detection = landmarkerService.detectVideoFrame(videoEl, 0);
          const rawDeltaSec = Math.max(0, Math.min(0.25, (nowTime - lastValidFrameTimeRef.current) / 1000));
          lastValidFrameTimeRef.current = nowTime;
          totalMonitoringSecondsRef.current += rawDeltaSec;

          if (detection && detection.landmarks && detection.landmarks.length >= 468) {
            consecutiveMissedFrames = 0;
            latestLandmarksRef.current = detection.landmarks;
            const now = detection.timestamp;
            const distanceResult = distanceEstimator.estimateDistance(detection.landmarks);

            // Process landmarks with shared hysteresis, neural blendshapes & temporal validation
            const blinkResult = blinkDetector.processLandmarks(
              detection.landmarks,
              now,
              detection.blendshapes,
              distanceResult.headPose,
              validObservationSecondsRef.current + rawDeltaSec,
              isBlinkChallengeActiveRef.current
            );

            // Instantaneous blink pulse detection for live widget counter & immediate UI rolling window update
            if (blinkResult.totalBlinks > lastEmittedBlinkCountRef.current) {
              lastEmittedBlinkCountRef.current = blinkResult.totalBlinks;
              const liveRollingBpm = blinkDetector.getRollingBlinkRate(now, validObservationSecondsRef.current + rawDeltaSec);
              window.irisNative?.sendBlinkDetected?.({
                timestamp: Date.now(),
                totalBlinks: blinkResult.totalBlinks,
                blinkRate: liveRollingBpm,
              });
              lastBlinkCompletionGraceMsRef.current = Date.now();
            }

            // Only accumulate valid observation duration when eye measurements are reliable
            if (blinkResult.isReliable) {
              validObservationSecondsRef.current += rawDeltaSec;
              // Accumulate active monitored screen time into daily plan (OCURE_DAILY_PLAN.md §2)
              OcureDailyPlanService.addActiveMonitoredSeconds(rawDeltaSec);
            }

            frameCount++;
            if (nowTime - lastFpsTime >= 1000) {
              const fps = Math.round((frameCount * 1000) / (nowTime - lastFpsTime));
              setTelemetry((prev) => ({
                ...prev,
                cameraFps: fps,
              }));
              frameCount = 0;
              lastFpsTime = nowTime;
            }

            setTelemetry((prev) => {
              const validSec = validObservationSecondsRef.current;
              const totalSec = totalMonitoringSecondsRef.current;
              const coveragePct =
                totalSec > 0.5
                  ? Math.min(100, Math.round((validSec / totalSec) * 100))
                  : 100;

              // Deterministic Session Average Blink Rate (BPM) = validated blinks ÷ valid observed monitoring time in minutes
              const dynamicBlinkRate = blinkDetector.getAverageBlinkRate(validSec);

              // Rolling 60s Blink Rate (BPM)
              const rollingBlinkRate = blinkDetector.getRollingBlinkRate(now, validSec);

              // Honest distance measurement: reflects real detector output, null when lost or uncalibrated
              const calibratedDistance = distanceResult.distanceCm;

              // Derive relative fatigue load score from valid observation duration and actual distance/blinks
              let dynamicFatigue: number | null = prev.fatigueScore;
              if (dynamicBlinkRate !== null && blinkResult.isReliable) {
                const distStrain = calibratedDistance !== null && calibratedDistance < 40 ? 1.2 : 0;
                const blinkStrain = dynamicBlinkRate < 10 ? 1.5 : dynamicBlinkRate < 14 ? 0.6 : 0;
                const sessionMinutes = validSec / 60;
                const baseFatigue = 1.0 + distStrain + blinkStrain + Math.min(2.0, sessionMinutes * 0.08);
                const prevFatigue = prev.fatigueScore ?? 1.5;
                dynamicFatigue = +(prevFatigue * 0.95 + baseFatigue * 0.05).toFixed(1);
              }

              const nowMs = Date.now();

              // Update rolling continuous buffers
              if (dynamicBlinkRate !== null && dynamicBlinkRate > 0) {
                lastKnownBlinkRateRef.current = dynamicBlinkRate;
              } else if (rollingBlinkRate !== null && rollingBlinkRate !== undefined && rollingBlinkRate > 0) {
                lastKnownBlinkRateRef.current = rollingBlinkRate;
              }
              if (calibratedDistance !== null && calibratedDistance > 0) {
                const alpha = Math.abs(lastKnownDistanceCmRef.current - calibratedDistance) > 8 ? 0.45 : 0.2;
                lastKnownDistanceCmRef.current = Math.round(
                  lastKnownDistanceCmRef.current * (1 - alpha) + calibratedDistance * alpha
                );
              }

              // Instant distance reactivity (< 38cm for >= 600ms -> alert, >= 40cm for >= 400ms -> recover)
              if (calibratedDistance !== null && calibratedDistance < 38) {
                rawNormalDistanceStartMsRef.current = null;
                if (rawTooCloseStartMsRef.current === null) {
                  rawTooCloseStartMsRef.current = nowMs;
                } else if (nowMs - rawTooCloseStartMsRef.current >= 600) {
                  if (!isTooCloseRef.current) {
                    isTooCloseRef.current = true;
                    // Level-triggered: immediately notify widget
                    window.irisNative?.sendLiveTelemetry?.({
                      blinkRate: dynamicBlinkRate !== null ? dynamicBlinkRate : (rollingBlinkRate ?? lastKnownBlinkRateRef.current),
                      screenDistance: calibratedDistance,
                      isTracking: blinkResult.isReliable,
                      faceDetected: true,
                      fatigueScore: dynamicFatigue,
                      activeMode: ((prev.activeMode || 'default').toLowerCase()) as BehaviorMode,
                      isTooClose: true,
                      secondsSinceLastBlink: 0,
                      requiredBlinks: isBlinkChallengeActiveRef.current ? 1 : 0,
                      isBlinkAlert: isBlinkChallengeActiveRef.current,
                      isDistanceAlert: true,
                    });
                  }
                }
              } else if (calibratedDistance !== null && calibratedDistance >= 40) {
                rawTooCloseStartMsRef.current = null;
                if (rawNormalDistanceStartMsRef.current === null) {
                  rawNormalDistanceStartMsRef.current = nowMs;
                } else if (nowMs - rawNormalDistanceStartMsRef.current >= 400) {
                  if (isTooCloseRef.current) {
                    isTooCloseRef.current = false;
                    // Level-triggered: immediately notify widget of recovery!
                    window.irisNative?.sendLiveTelemetry?.({
                      blinkRate: dynamicBlinkRate !== null ? dynamicBlinkRate : (rollingBlinkRate ?? lastKnownBlinkRateRef.current),
                      screenDistance: calibratedDistance,
                      isTracking: blinkResult.isReliable,
                      faceDetected: true,
                      fatigueScore: dynamicFatigue,
                      activeMode: ((prev.activeMode || 'default').toLowerCase()) as BehaviorMode,
                      isTooClose: false,
                      secondsSinceLastBlink: 0,
                      requiredBlinks: isBlinkChallengeActiveRef.current ? 1 : 0,
                      isBlinkAlert: isBlinkChallengeActiveRef.current,
                      isDistanceAlert: false,
                    });
                  }
                }
              }

              // Deterministic 1, 2, or 3 blink target evaluation
              const secondsSinceLastBlink = blinkResult.lastBlinkTime ? Math.max(0, (now - blinkResult.lastBlinkTime) / 1000) : 0;
              const inGraceWindow = nowMs - lastBlinkCompletionGraceMsRef.current < 45000;
              let calculatedRequiredBlinks = 0;
              const effectiveRate = dynamicBlinkRate !== null ? dynamicBlinkRate : (rollingBlinkRate ?? lastKnownBlinkRateRef.current);

              if (!inGraceWindow && blinkResult.isReliable && validSec >= 6) {
                if (secondsSinceLastBlink >= 15 || effectiveRate <= 5) {
                  calculatedRequiredBlinks = 3;
                } else if (secondsSinceLastBlink >= 10 || effectiveRate <= 10) {
                  calculatedRequiredBlinks = 2;
                } else if (secondsSinceLastBlink >= 6 || effectiveRate < 15) {
                  calculatedRequiredBlinks = 1;
                }
              }

              isBlinkChallengeActiveRef.current = calculatedRequiredBlinks > 0;

              // Explicit alert state evaluation for Floating Widget and Gaming Mode edge lighting
              const isBlinkAlertActive = !inGraceWindow && (calculatedRequiredBlinks > 0 || (effectiveRate > 0 && effectiveRate < 15));
              const isDistanceAlertActive = Boolean(isTooCloseRef.current);

              // Throttled continuous rolling telemetry broadcast to Floating Widget & Screen-Edge Lighting (every 500ms)
              if (nowMs - lastWidgetTelemetrySyncMsRef.current >= 500) {
                lastWidgetTelemetrySyncMsRef.current = nowMs;
                window.irisNative?.sendLiveTelemetry?.({
                  blinkRate: dynamicBlinkRate !== null ? dynamicBlinkRate : (rollingBlinkRate ?? lastKnownBlinkRateRef.current),
                  screenDistance: calibratedDistance !== null ? calibratedDistance : lastKnownDistanceCmRef.current,
                  isTracking: blinkResult.isReliable,
                  faceDetected: true,
                  fatigueScore: dynamicFatigue,
                  activeMode: ((prev.activeMode || 'default').toLowerCase()) as BehaviorMode,
                  isTooClose: isTooCloseRef.current,
                  secondsSinceLastBlink: Math.round(secondsSinceLastBlink),
                  requiredBlinks: calculatedRequiredBlinks,
                  isBlinkAlert: isBlinkAlertActive,
                  isDistanceAlert: isDistanceAlertActive,
                });
              }

              // Record real live telemetry point every 2.5s once valid observations exist
              if (
                blinkResult.isReliable &&
                nowMs - lastRecordTimeRef.current >= 2500 &&
                (dynamicBlinkRate !== null || calibratedDistance !== null)
              ) {
                TelemetryStorageService.recordLiveTelemetryPoint(
                  dynamicBlinkRate ?? 0,
                  calibratedDistance ?? 0,
                  dynamicFatigue ?? 1.0
                );
                lastRecordTimeRef.current = nowMs;
              }

              // Distance alert: requires sustained proximity (< threshold) for at least 3.0s with 45s cooldown
              const currentSensitivity = postureSensitivityRef.current;
              const proxThreshold =
                currentSensitivity === 'High' ? 48 : currentSensitivity === 'Low' ? 35 : 40;
              let updatedDistAlerts = prev.distanceAlerts;
              if (
                blinkResult.isReliable &&
                calibratedDistance !== null &&
                calibratedDistance < proxThreshold
              ) {
                if (sustainedProximityStartMsRef.current === null) {
                  sustainedProximityStartMsRef.current = nowMs;
                } else if (
                  nowMs - sustainedProximityStartMsRef.current >= 3000 &&
                  nowMs - lastProximityWarningRef.current > 45000
                ) {
                  lastProximityWarningRef.current = nowMs;
                  sustainedProximityStartMsRef.current = null;
                  updatedDistAlerts += 1;
                  const proxLog: EyeBreakLog = {
                    id: `alert-dist-${nowMs}`,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    type: `Distance Alert (< ${proxThreshold}cm)`,
                    durationSeconds: 10,
                    complianceScore: 65,
                    status: 'Warning',
                    telemetrySnapshot: {
                      blinkRate: dynamicBlinkRate,
                      distanceCm: calibratedDistance,
                      fatigueScore: dynamicFatigue,
                    },
                    notes: `Screen distance remained below ${proxThreshold} cm for over 3 seconds (${calibratedDistance} cm).`,
                  };
                  setLogs((current) => TelemetryStorageService.addSessionLog(proxLog));
                }
              } else {
                sustainedProximityStartMsRef.current = null;
              }

              // Ergonomic Alert: Digital lock-in warning (< 10 blinks/min after >= 60s observation)
              let updatedBlinkAlerts = prev.blinkAlerts;
              if (
                blinkResult.isReliable &&
                validSec >= 60 &&
                dynamicBlinkRate !== null &&
                dynamicBlinkRate < 10 &&
                nowMs - lastLockinWarningRef.current > 60000
              ) {
                lastLockinWarningRef.current = nowMs;
                updatedBlinkAlerts += 1;
                const lockinLog: EyeBreakLog = {
                  id: `alert-blink-${nowMs}`,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  type: 'Digital Lock-in Warning (< 10/min)',
                  durationSeconds: 15,
                  complianceScore: 70,
                  status: 'Warning',
                  telemetrySnapshot: {
                    blinkRate: dynamicBlinkRate,
                    distanceCm: calibratedDistance,
                    fatigueScore: dynamicFatigue,
                  },
                  notes: `Blink rate dropped to ${dynamicBlinkRate} blinks/min. Corneal tear film breakup risk elevated.`,
                };
                setLogs((current) => TelemetryStorageService.addSessionLog(lockinLog));
              }

              const newScreenHours = Number((validSec / 3600).toFixed(2));

              return {
                ...prev,
                avgBlinkRate: dynamicBlinkRate !== null ? dynamicBlinkRate : prev.avgBlinkRate,
                rollingBlinkRate,
                avgScreenDistance: calibratedDistance,
                fatigueScore: dynamicFatigue,
                gazePointsAudited: blinkResult.isReliable ? prev.gazePointsAudited + 1 : prev.gazePointsAudited,
                observationSeconds: validSec,
                totalMonitoringSeconds: totalSec,
                trackingCoveragePct: coveragePct,
                totalBlinksDetected: blinkResult.totalBlinks,
                fullBlinksDetected: blinkResult.fullBlinks,
                partialBlinksDetected: blinkResult.partialBlinks,
                leftEyeAperture: blinkResult.leftEyeOpening,
                rightEyeAperture: blinkResult.rightEyeOpening,
                combinedAperture: blinkResult.combinedOpening,
                baselineAperture: blinkResult.baselineOpening,
                closureThresholdEAR: blinkResult.closureThresholdEAR,
                reopenThresholdEAR: blinkResult.reopenThresholdEAR,
                fullClosureThresholdEAR: blinkResult.fullClosureThresholdEAR,
                eyeClosureScore: blinkResult.eyeClosureScore,
                blinkState: blinkResult.state,
                blinkConfidence: blinkResult.confidence,
                lastBlinkTimestamp: blinkResult.lastBlinkTime,
                lastBlinkDurationMs: blinkResult.lastBlinkDurationMs,
                lastBlinkType: blinkResult.lastBlinkType,
                candidateLogs: blinkResult.candidateLogs,
                isCalibrated: distanceResult.isCalibrated,
                isMonitoring: true,
                faceDetected: true,
                isReliable: blinkResult.isReliable,
                blinkAlerts: updatedBlinkAlerts,
                distanceAlerts: updatedDistAlerts,
                screenTimeHours: newScreenHours,
                longestSessionHours: Math.max(prev.longestSessionHours, newScreenHours),
                trackingQuality: blinkResult.trackingQuality,
                headPose: distanceResult.headPose,
                ...extractExerciseMotionFeatures(
                  detection.landmarks,
                  detection.blendshapes,
                  distanceResult.headPose
                ),
              };
            });
          } else {
            // Confirm face loss across consecutive frames before resetting state so single-frame drops do not flicker
            consecutiveMissedFrames += 1;
            if (consecutiveMissedFrames >= 3) {
              blinkDetector.resetTransientState();
              sustainedProximityStartMsRef.current = null;
              const validSec = validObservationSecondsRef.current;
              const totalSec = totalMonitoringSecondsRef.current;
              const coveragePct =
                totalSec > 0.5
                  ? Math.min(100, Math.round((validSec / totalSec) * 100))
                  : 100;
              const nowLiveMs = Date.now();
              if (nowLiveMs - lastWidgetTelemetrySyncMsRef.current >= 600) {
                lastWidgetTelemetrySyncMsRef.current = nowLiveMs;
                window.irisNative?.sendLiveTelemetry?.({
                  blinkRate: lastKnownBlinkRateRef.current,
                  screenDistance: lastKnownDistanceCmRef.current,
                  isTracking: false,
                  faceDetected: false,
                  fatigueScore: null,
                  activeMode: ((telemetry.activeMode || 'default').toLowerCase()) as BehaviorMode,
                  isTooClose: isTooCloseRef.current,
                  secondsSinceLastBlink: 0,
                  requiredBlinks: 0,
                  isBlinkAlert: false,
                  isDistanceAlert: isTooCloseRef.current,
                });
              }
              setTelemetry((prev) => ({
                ...prev,
                faceDetected: false,
                isReliable: false,
                avgScreenDistance: null,
                blinkState: 'OPEN',
                trackingQuality: 'Lost',
                totalMonitoringSeconds: totalSec,
                trackingCoveragePct: coveragePct,
              }));
            }
          }
        }

        scheduleNextIteration(processLoop);
      };

      scheduleNextIteration(processLoop);
    };

    initAndRun();

    return () => {
      isCancelled = true;
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      if (loopTimerId) clearTimeout(loopTimerId);
      blinkDetector.resetTransientState();
      landmarkerService.dispose();
    };
  }, [isMonitoring, cameraStatus, hasCompletedOnboarding, isOnboardingOpen]);

  // Synchronize Firebase Auth state
  useEffect(() => {
    try {
      localStorage.removeItem('iris_guest_access');
      const storedDesktopUser = localStorage.getItem('iris_desktop_user');
      if (storedDesktopUser) {
        const parsed = JSON.parse(storedDesktopUser);
        if (parsed && parsed.email) {
          setCurrentUser(parsed as User);
        }
      }
    } catch {
      // Safe ignore
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      localStorage.removeItem('iris_desktop_user');
    } catch {}
    await logOut();
    setCurrentUser(null);
  };

  // Sync daily break progress across midnight rollovers and session completions
  useEffect(() => {
    const syncDailyBreaks = () => {
      const completedToday = OcureDailyPlanService.getCompletedBreaksTodayCount();
      const targetProgress = Math.min(100, Math.round((completedToday / OCURE_CONFIG.MAX_DAILY_BREAKS) * 100));
      setTelemetry((prev) => (prev.dayProgress !== targetProgress ? { ...prev, dayProgress: targetProgress } : prev));
      if (!OcureDailyPlanService.canStartBreakToday()) {
        setScheduledBreakOffer(null);
      }
    };
    syncDailyBreaks();
    const timer = setInterval(syncDailyBreaks, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleResetAutoMode = useCallback(async () => {
    if (window.irisNative?.resetAutoMode) {
      try {
        const res = await window.irisNative.resetAutoMode();
        setTelemetry((prev) => ({
          ...prev,
          activeMode: res.activeMode,
          isManualModeOverride: false,
          distanceOptimal: res.activeMode === 'gaming' ? 35 : res.activeMode === 'meeting' ? 45 : 40,
        }));
        setModeNotice({
          message: `Auto-Detect Mode active. Mode set to ${res.activeMode.toUpperCase()}.`,
          type: 'info',
        });
        if (modeNoticeTimerRef.current) clearTimeout(modeNoticeTimerRef.current);
        modeNoticeTimerRef.current = setTimeout(() => setModeNotice(null), 3500);
      } catch (err) {
        console.warn('Failed to reset auto mode:', err);
      }
    }
  }, []);

  const handleChangeMode = async (mode: BehaviorMode) => {
    // If clicking the current active mode while in manual override, seamlessly toggle back to auto-detect
    if (telemetry.isManualModeOverride && mode === telemetry.activeMode) {
      await handleResetAutoMode();
      return;
    }

    if (window.irisNative?.validateAndSetMode) {
      try {
        const result = await window.irisNative.validateAndSetMode(mode);
        setTelemetry((prev) => ({
          ...prev,
          activeMode: result.activeMode,
          isManualModeOverride: true,
          distanceOptimal: result.activeMode === 'gaming' ? 35 : result.activeMode === 'meeting' ? 45 : 40,
        }));
        setModeNotice({
          message: `Manual Override: Switched to ${result.activeMode.toUpperCase()} mode.`,
          type: 'info',
        });
        if (modeNoticeTimerRef.current) clearTimeout(modeNoticeTimerRef.current);
        modeNoticeTimerRef.current = setTimeout(() => setModeNotice(null), 3000);
        return;
      } catch (err) {
        console.warn('Native mode set failed, falling back:', err);
      }
    }

    window.irisNative?.changeWidgetMode?.(mode);
    setTelemetry((prev) => ({
      ...prev,
      activeMode: mode,
      isManualModeOverride: true,
      distanceOptimal: mode === 'gaming' ? 35 : mode === 'meeting' ? 45 : 40,
    }));
  };

  const handleCompleteBreak = (breakType: string = 'Coach Break', durationSeconds: number = 120) => {
    const newLog: EyeBreakLog = {
      id: `break-${Date.now()}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: breakType,
      durationSeconds,
      complianceScore: 100,
      status: 'Completed',
      telemetrySnapshot: {
        blinkRate: telemetry.avgBlinkRate,
        distanceCm: telemetry.avgScreenDistance,
        fatigueScore: telemetry.fatigueScore,
      },
      notes: 'Break completed.',
    };
    setLogs((prev) => TelemetryStorageService.addSessionLog(newLog));
    const completedToday = OcureDailyPlanService.getCompletedBreaksTodayCount();
    setTelemetry((prev) => ({
      ...prev,
      dayProgress: Math.min(100, Math.round((completedToday / OCURE_CONFIG.MAX_DAILY_BREAKS) * 100)),
      fatigueScore:
        prev.fatigueScore !== null
          ? Math.max(1.0, +(prev.fatigueScore - 0.2).toFixed(1))
          : null,
    }));
  };

  const handleClearLogs = () => {
    TelemetryStorageService.clearSessionLogs();
    setLogs([]);
  };

  const handleLogManualSession = (type: string = 'Manual Check', durationSeconds: number = 30) => {
    const newLog: EyeBreakLog = {
      id: `session-${Date.now()}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type,
      durationSeconds,
      complianceScore: 100,
      status: 'Completed',
      telemetrySnapshot: {
        blinkRate: telemetry.avgBlinkRate,
        distanceCm: telemetry.avgScreenDistance,
        fatigueScore: telemetry.fatigueScore,
      },
      notes: 'Activity snapshot saved.',
    };
    setLogs((prev) => TelemetryStorageService.addSessionLog(newLog));
  };

  // Periodic Daily Plan Break Offer Checker (OCURE_DAILY_PLAN.md §2)
  useEffect(() => {
    if (!isMonitoring) return;
    const checkOffer = () => {
      if (isOcureSessionActiveRef.current) return;
      if (!OcureDailyPlanService.canStartBreakToday()) {
        setScheduledBreakOffer(null);
        return;
      }
      const plan = OcureDailyPlanService.getDailyPlan();
      const isSnoozed = plan.snoozedUntilTimestamp && Date.now() < plan.snoozedUntilTimestamp;
      const curTel = telemetryRef.current;
      if (
        !isSnoozed &&
        curTel.observationSeconds > 0 &&
        OcureDailyPlanService.getCompletedBreaksTodayCount() < OCURE_CONFIG.MAX_DAILY_BREAKS &&
        plan.activeMonitoredSecondsSinceLastEvent >= OCURE_CONFIG.MIN_ACTIVE_MINUTES_BETWEEN_OFFERS * 60
      ) {
        const classification = classifyBlinkRate(
          curTel.avgBlinkRate,
          curTel.observationSeconds,
          curTel.trackingCoveragePct ?? 100
        );
        const nextRoutine = selectNextRoutine({
          todayUsedRoutineIds: Array.from(
            new Set([...plan.completedRoutineIds, ...(plan.usedRoutineIds || [])])
          ),
          todayOfferedRoutineIds: plan.offeredRoutineIds,
          latestReliableBand: classification.band,
          localDateOrdinal: getLocalDateOrdinal(),
        });
        if (nextRoutine) {
          setScheduledBreakOffer((prev) => (prev?.id === nextRoutine.id ? prev : nextRoutine));
        }
      }
    };

    checkOffer();
    const interval = setInterval(checkOffer, 5000);
    return () => clearInterval(interval);
  }, [isMonitoring]);

  const handleAcceptBreakOffer = () => {
    if (scheduledBreakOffer) {
      OcureDailyPlanService.recordOfferOutcome(scheduledBreakOffer.id, 'accepted');
      handleOpenBreakSession(scheduledBreakOffer.id);
      setScheduledBreakOffer(null);
    }
  };

  const handleSnoozeOrDeclineBreakOffer = () => {
    if (scheduledBreakOffer) {
      const snoozed = OcureDailyPlanService.snoozeOffer();
      if (!snoozed) {
        OcureDailyPlanService.recordOfferOutcome(scheduledBreakOffer.id, 'declined');
      }
      setScheduledBreakOffer(null);
    }
  };

  const handleCompleteOnboarding = (metadata: PersistedCalibrationMetadata | null) => {
    userStoppedMonitoringRef.current = false;
    OnboardingSetupStorage.markSetupComplete();
    confirmStyleSelection(styleMode);
    setHasCompletedOnboarding(true);
    setIsOnboardingOpen(false);
    setOnboardingRecoveryReason(undefined);

    // Reload calibration in distanceEstimator and blinkDetector
    distanceEstimatorRef.current.loadCalibration();
    if (metadata?.baselineEAR) {
      blinkDetectorRef.current.setBaseline(metadata.baselineEAR);
    }
    const updatedThresholds = blinkDetectorRef.current.getThresholds();

    // Auto-monitoring: automatically engage continuous monitoring on the dashboard
    const isCalibratedNow = distanceEstimatorRef.current.isUserCalibrated() || !!metadata?.calibrationValid || !!metadata?.timestamp;
    const initialDistance = 48;
    setTelemetry((prev) => ({
      ...prev,
      isCalibrated: isCalibratedNow,
      avgScreenDistance: isCalibratedNow ? (prev.avgScreenDistance || initialDistance) : null,
      isMonitoring: true,
      baselineAperture: updatedThresholds.baselineEAR,
      closureThresholdEAR: updatedThresholds.closureThresholdEAR,
      reopenThresholdEAR: updatedThresholds.reopenThresholdEAR,
      fullClosureThresholdEAR: updatedThresholds.fullClosureThresholdEAR,
    }));

    if (videoRef.current) {
      startCamera(videoRef.current).catch(() => {});
    }
    setTimeout(() => {
      startMonitoring();
    }, 100);

    const onboardingLog: EyeBreakLog = {
      id: `onboarding-${Date.now()}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'Camera Setup & Auto-Monitoring Initialized',
      durationSeconds: 0,
      complianceScore: 100,
      status: 'Completed',
      telemetrySnapshot: {
        blinkRate: telemetry.avgBlinkRate,
        distanceCm: null,
        fatigueScore: 1.0,
      },
      notes: 'Camera access verified, face and eye alignment confirmed, and relative positioning baseline saved locally.',
    };
    setLogs((prev) => TelemetryStorageService.addSessionLog(onboardingLog));
  };

  // User name resolution with clean formatting
  const rawName =
    currentUser?.displayName ||
    (currentUser?.email ? currentUser.email.split('@')[0] : 'Hinta Suresh');
  const formattedUserName =
    rawName
      .replace(/[._]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ') || 'Hinta Suresh';

  return (
    <>
      {/* Viewport-bounded hidden video element for continuous browser decoding without throttling */}
      <video
        ref={videoRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0.01,
          pointerEvents: 'none',
          zIndex: -1,
        }}
        playsInline
        muted
        autoPlay
      />

      {/* Custom macOS Traffic Light Controls for Frameless Window */}
      <MacTitleBar />

      {!currentUser ? (
        <IrisEntrancePortal
          onAuthenticated={(user) => {
            setCurrentUser(user);
          }}
        />
      ) : (!hasCompletedOnboarding || isOnboardingOpen) ? (
        <IrisOnboardingFlow
          initialStep={isOnboardingOpen ? 'welcome' : onboardingInitialStep}
          recoveryReason={isOnboardingOpen ? undefined : onboardingRecoveryReason}
          onComplete={handleCompleteOnboarding}
        />
      ) : isStyleChooserOpen ? (
        <StyleChooserScreen
          userName={formattedUserName}
          onSelectStyle={(mode) => {
            confirmStyleSelection(mode);
          }}
        />
      ) : (
        <div
          className={`bg-sky-canvas flex font-dm w-full relative ${
            activeTab === 'retis' || activeTab === 'ocure'
              ? 'h-dvh max-h-dvh overflow-hidden'
              : 'min-h-screen overflow-x-hidden'
          }`}
        >
      {/* Global Persistent Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        nextBreakSeconds={telemetry.nextBreakSeconds}
        onOpenPreferences={() => setIsPreferencesOpen(true)}
        onOpenBreakModal={() => handleOpenBreakSession()}
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenDocs={() => setIsDocsModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Content Area with Smooth Width Enlargement Animation */}
      <div
        className={`flex flex-col flex-1 min-w-0 w-full transition-all duration-300 ease-in-out ${
          activeTab === 'retis' || activeTab === 'ocure'
            ? 'h-dvh max-h-dvh overflow-hidden'
            : 'min-h-screen overflow-x-hidden'
        } ${isSidebarCollapsed ? 'pl-0' : 'pl-0 lg:pl-72'}`}
      >
        {/* Persistent Top Header with Real Firebase Google Account */}
        <Header
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          userName={formattedUserName}
          logs={logs}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
          onOpenDocs={() => setIsDocsModalOpen(true)}
        />

        {/* Active Mode Validation Notice Toast */}
        {modeNotice && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-full px-4 animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-900/95 border border-amber-500/40 shadow-2xl backdrop-blur-md text-amber-200 text-sm">
              <svg className="w-5 h-5 flex-shrink-0 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span className="flex-1 font-medium">{modeNotice.message}</span>
              <button
                type="button"
                onClick={() => setModeNotice(null)}
                className="text-neutral-400 hover:text-white transition p-1"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Route View - Fits viewport for OCURE and RETIS */}
        <main
          style={
            activeTab === 'retis' || activeTab === 'ocure'
              ? {
                  marginTop: 'var(--iris-top-nav-height, 80px)',
                  height: 'calc(100dvh - var(--iris-top-nav-height, 80px))',
                  maxHeight: 'calc(100dvh - var(--iris-top-nav-height, 80px))',
                }
              : undefined
          }
          className={`relative w-full mx-auto px-4 sm:px-6 lg:px-9 flex-1 min-w-0 box-border transition-all duration-300 ease-in-out ${
            activeTab === 'retis' || activeTab === 'ocure'
              ? 'pt-2 pb-2 sm:pb-3 flex flex-col min-h-0 overflow-y-auto lg:overflow-hidden'
              : 'pt-24 lg:pt-28 pb-10'
          } ${isSidebarCollapsed ? 'max-w-[1720px]' : 'max-w-[1540px]'}`}
        >
          <div
            key={activeTab}
            className={
              activeTab === 'retis' || activeTab === 'ocure'
                ? 'animate-page-enter w-full flex-1 min-h-0 h-full overflow-hidden flex flex-col'
                : 'animate-page-enter w-full'
            }
          >
            {activeTab === 'dashboard' && (
              <DashboardScreen
                telemetry={{
                  ...telemetry,
                  monitoringState,
                  eyeDetectionState,
                }}
                onSelectTab={setActiveTab}
                onChangeMode={handleChangeMode}
                onOpenBreakModal={() => handleOpenBreakSession()}
                onOpenPreferences={() => setIsPreferencesOpen(true)}
                userName={formattedUserName}
                isMonitoring={isMonitoring}
                monitoringState={monitoringState}
                eyeDetectionState={eyeDetectionState}
                cameraStatus={cameraStatus}
                cameraPermissionState={cameraPermissionState}
                cameraError={cameraError}
                onToggleMonitoring={handleToggleMonitoring}
                onOpenCalibration={() => setIsCalibrationOpen(true)}
                onOpenBlinkAudit={() => setIsDebugModalOpen(true)}
                isGlassesMode={isGlassesMode}
                onToggleGlassesMode={() => setIsGlassesMode((prev) => !prev)}
                onOpenCameraPanel={() => setIsCameraPanelOpen(true)}
                isManualModeOverride={Boolean(telemetry.isManualModeOverride)}
                onResetAutoMode={handleResetAutoMode}
              />
            )}

            {activeTab === 'ocure' && (
              <OcureScreen
                telemetry={telemetry}
                onBackToDashboard={() => setActiveTab('dashboard')}
                onSelectTab={setActiveTab}
                initialRoutineId={ocureTargetRoutineId}
                onSessionStateChange={handleSessionStateChange}
                onSessionFinished={() => handleCompleteBreak('Coach Break', 120)}
                isMonitoring={isMonitoring}
                cameraStatus={cameraStatus}
                cameraError={cameraError}
                onStartMonitoring={startMonitoring}
                onStopMonitoring={stopMonitoring}
              />
            )}

            {activeTab === 'retis' && (
              <RetisScreen
                telemetry={telemetry}
                onSelectTab={setActiveTab}
                onOpenBreakModal={() => handleOpenBreakSession()}
                onOpenPreferences={() => setIsPreferencesOpen(true)}
                userName={formattedUserName}
                isMonitoring={isMonitoring}
                cameraStatus={cameraStatus}
                cameraError={cameraError}
                onOpenCalibration={() => setIsCalibrationOpen(true)}
              />
            )}

            {activeTab === 'logs' && (
              <SessionLogsScreen
                logs={logs}
                onOpenBreakModal={() => handleOpenBreakSession()}
                isMonitoring={isMonitoring}
                onToggleMonitoring={handleToggleMonitoring}
                telemetry={telemetry}
                onLogManualSession={handleLogManualSession}
                onClearLogs={handleClearLogs}
              />
            )}
          </div>
        </main>
      </div>

      {/* Preferences Modal */}
      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        activeMode={telemetry.activeMode}
        onChangeMode={handleChangeMode}
        intervalMinutes={breakIntervalMinutes}
        onChangeInterval={setBreakIntervalMinutes}
        audioAlerts={audioAlerts}
        onToggleAudio={() => setAudioAlerts(!audioAlerts)}
        postureSensitivity={postureSensitivity}
        onChangeSensitivity={setPostureSensitivity}
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        isCalibrated={telemetry.isCalibrated}
        calibratedDistance={telemetry.avgScreenDistance}
        onResetCalibration={handleResetCalibration}
        onQuickCalibrate={handleCalibrateDistance}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenDocs={() => setIsDocsModalOpen(true)}
        widgetDesign={widgetDesign}
        onChangeWidgetDesign={handleChangeWidgetDesign}
      />

      {/* Screen Distance Calibration Modal */}
      <DistanceCalibrationModal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        telemetry={telemetry}
        isMonitoring={isMonitoring}
        onToggleMonitoring={handleToggleMonitoring}
        onCalibrate={handleCalibrateDistance}
        onResetCalibration={handleResetCalibration}
        initialReferenceDistance={telemetry.avgScreenDistance || 50}
      />

      {/* Blink Diagnostics & Verification Modal */}
      <BlinkDebugModal
        isOpen={isDebugModalOpen}
        onClose={() => setIsDebugModalOpen(false)}
        telemetry={telemetry}
        isMonitoring={isMonitoring}
        onToggleMonitoring={handleToggleMonitoring}
        rawLandmarks={latestLandmarksRef.current}
        videoElement={videoRef.current}
      />

      {/* Camera Compatibility & Glasses Detection Status Panel */}
      <CameraCompatibilityPanel
        isOpen={isCameraPanelOpen}
        onClose={() => setIsCameraPanelOpen(false)}
        diagnostics={cameraDiagnostics}
        isGlassesMode={isGlassesMode}
        onToggleGlassesMode={() => setIsGlassesMode((prev) => !prev)}
        onResetRecovery={resetRecovery}
        isMonitoring={isMonitoring}
        onToggleMonitoring={handleToggleMonitoring}
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        isDark={isDark}
        isLiquidGlass={widgetDesign === 'liquid-glass'}
      />

      {/* Onboarding Specs & 14-Point QA Test Plan Modal */}
      <IrisOnboardingDocsModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
      />

      {/* Scheduled Break Offer Floating Widget Card (OCURE_DAILY_PLAN.md §2) */}
      {scheduledBreakOffer && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-bottom-4 duration-300">
          <div className="p-4 rounded-2xl tactile-card-orange flex flex-col gap-3 shadow-xl border-2 border-black">
            <div className="flex items-center justify-between">
              <span className="font-dm text-[11px] uppercase font-bold tracking-wider">
                Daily Break Suggestion
              </span>
              <span className="glass-badge text-[10px]">2 Minutes</span>
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-relaxed">
              Time for a short break? Today: {scheduledBreakOffer.name}, 2 minutes.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAcceptBreakOffer}
                className="btn-pill-primary flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start</span>
              </button>
              <button
                type="button"
                onClick={handleSnoozeOrDeclineBreakOffer}
                className="btn-pill-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
              >
                <span>Later</span>
              </button>
            </div>
          </div>
        </div>
      )}

        </div>
      )}
    </>
  );
}
