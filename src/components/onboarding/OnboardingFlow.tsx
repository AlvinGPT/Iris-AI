import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OrbitingEyeLogo } from '../OrbitingEyeLogo';
import { OnboardingStep } from '../../types';
import { useTheme, StyleMode } from '../../context/ThemeContext';
import { useCamera, CameraService } from '../../services/cameraService';
import { FaceLandmarkerService } from '../../services/faceLandmarkerService';
import { DistanceEstimator } from '../../services/distanceEstimator';
import {
  FACE_ID_SECTOR_COUNT,
  FACE_ID_TICK_COUNT,
  GUIDED_FACE_CHECK_STEPS,
  OnboardingVisionEvaluator,
  LiveStreamFrameValidator,
  OnboardingSetupStorage,
  FacePositioningEvaluation,
  EyeAlignmentEvaluation,
  CalibrationProgressState,
  PersistedCalibrationMetadata,
} from '../../services/onboardingVisionService';
import { getOnboardingTokens } from './onboardingTheme';
import { OnboardingProgress } from './OnboardingProgress';
import { WelcomeStep } from './WelcomeStep';
import { PrivacyPolicyStep } from './PrivacyPolicyStep';
import { CameraPermissionStep } from './CameraPermissionStep';
import { CameraPositionStep, CalibrationScreenPhase } from './CameraPositionStep';
import { EyeAlignmentStep } from './EyeAlignmentStep';
import { CalibrationStep } from './CalibrationStep';
import { SetupCompleteStep } from './SetupCompleteStep';

export interface OnboardingFlowProps {
  initialStep?: OnboardingStep;
  recoveryReason?: string;
  onComplete: (metadata: PersistedCalibrationMetadata | null) => void;
}

const INITIAL_FACE_EVAL: FacePositioningEvaluation = {
  faceDetected: false,
  landmarksValid: false,
  bothEyesValid: false,
  isLiveFrame: false,
  faceInsideGuide: false,
  detectionStable: false,
  stabilityProgressPct: 0,
  stableDurationMs: 0,
  canContinueFromFacePositioning: false,
  detectionState: 'Initializing camera',
  uiState: 'initializing_camera',
  instruction: GUIDED_FACE_CHECK_STEPS[0].instruction,
  helperText: GUIDED_FACE_CHECK_STEPS[0].helperText,
  guideLabel: GUIDED_FACE_CHECK_STEPS[0].instruction,
  faceBox: null,
  faceCenter: null,
  silhouettePoints: null,
  meshPoints: null,
  leftEye: null,
  rightEye: null,
  eyeMidpoint: null,
  eyeLevelY: null,
  headPose: { yaw: 0, pitch: 0, roll: 0 },
  currentEyeEAR: 0,
  closureThresholdEAR: 0.235,
  currentStepIndex: 0,
  totalSteps: GUIDED_FACE_CHECK_STEPS.length,
  currentStepId: GUIDED_FACE_CHECK_STEPS[0].id,
  completedStepIds: [],
  stepSatisfied: false,
  stepHoldProgressPct: 0,
  stepTimedOut: false,
  timeoutDiagnostic: null,
  calibrationSkipped: false,
  filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
  sectorFrameCounts: new Array<number>(FACE_ID_SECTOR_COUNT).fill(0),
  completedSectors: 0,
  totalSectors: GUIDED_FACE_CHECK_STEPS.length,
  activeSector: 0,
  calibrationProgressPct: 0,
  savedMetadata: null,
};

const INITIAL_EYE_EVAL: EyeAlignmentEvaluation = {
  faceDetected: false,
  bothEyesDetected: false,
  bothEyesReliable: false,
  eyeMidpointInsideArea: false,
  headRotationValid: false,
  eyeLevelAligned: false,
  eyeDetectionStable: false,
  stabilityProgressPct: 0,
  stableDurationMs: 0,
  canContinueFromEyeAlignment: false,
  detectionState: 'Initializing camera',
  instruction: 'Initializing camera…',
  secondaryStatus: null,
  faceBox: null,
  silhouettePoints: null,
  leftEye: null,
  rightEye: null,
  eyeMidpoint: null,
  eyeLevelY: null,
  headPose: { yaw: 0, pitch: 0, roll: 0 },
  leftEyeEAR: 0,
  rightEyeEAR: 0,
  filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
};

const INITIAL_CALIBRATION_STATE: CalibrationProgressState = {
  phase: 'Checking camera',
  progressPct: 0,
  samplesCollected: 0,
  requiredSamples: 16,
  calibrationSucceeded: false,
  calibrationSaved: false,
  canFinishCalibration: false,
  errorExplanation: null,
  savedMetadata: null,
  filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialStep = 'welcome',
  recoveryReason,
  onComplete,
}) => {
  const { styleMode, setStyleMode } = useTheme();
  const tokens = getOnboardingTokens(styleMode);
  const isVivid = styleMode === 'vivid';

  const storedRecord = OnboardingSetupStorage.getRecord();
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState<boolean>(
    storedRecord.privacyAcknowledged
  );
  const [calibrationScreenPhase, setCalibrationScreenPhase] =
    useState<CalibrationScreenPhase>('intro');

  // Camera and Vision services
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenCaptureVideoRef = useRef<HTMLVideoElement | null>(null);
  const loopGenerationRef = useRef<number>(0);
  const lastAnnouncedStepRef = useRef<string>('');

  const {
    status: cameraStatus,
    permissionState,
    error: cameraError,
    stream,
    isStreamActive,
    startCamera,
    stopCamera,
  } = useCamera({ keepAliveOnUnmount: true });

  const landmarkerRef = useRef(new FaceLandmarkerService());
  const distanceEstimatorRef = useRef(new DistanceEstimator());
  const visionEvaluatorRef = useRef(new OnboardingVisionEvaluator());
  const frameValidatorRef = useRef(new LiveStreamFrameValidator());

  const [faceEval, setFaceEval] = useState<FacePositioningEvaluation>(INITIAL_FACE_EVAL);
  const [eyeEval, setEyeEval] = useState<EyeAlignmentEvaluation>(INITIAL_EYE_EVAL);
  const [calibrationState, setCalibrationState] = useState<CalibrationProgressState>(
    INITIAL_CALIBRATION_STATE
  );
  const [announcement, setAnnouncement] = useState<string>('');

  // Ensure initialStep updates if recovery route changes
  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  // Pre-warm MediaPipe FaceLandmarker model in the background once camera permission is reached
  useEffect(() => {
    if (
      step === 'cameraPermission' ||
      step === 'facePositioning' ||
      step === 'eyeAlignment' ||
      step === 'calibration'
    ) {
      landmarkerRef.current.initialize().catch(() => {});
    }
  }, [step]);

  // Start camera stream automatically when entering active scanning or recovery steps
  useEffect(() => {
    if (
      (step === 'facePositioning' || step === 'eyeAlignment' || step === 'calibration') &&
      !isStreamActive &&
      !CameraService.getInstance().isStreamActive()
    ) {
      const targetVideo = previewVideoRef.current || hiddenCaptureVideoRef.current;
      if (targetVideo) {
        startCamera(targetVideo).catch(() => {
          setStep('cameraPermission');
        });
      }
    }
  }, [step, isStreamActive, startCamera]);

  // Attach active MediaStream to the visible preview <video> whenever step, phase, or stream changes
  useEffect(() => {
    const videoEl = previewVideoRef.current;
    const activeStream = stream || CameraService.getInstance().getStream();
    if (
      videoEl &&
      activeStream &&
      (step === 'facePositioning' || step === 'eyeAlignment' || step === 'calibration')
    ) {
      if (videoEl.srcObject !== activeStream) {
        videoEl.srcObject = activeStream;
      }
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.play().catch(() => {});
    }
  }, [step, calibrationScreenPhase, stream, isStreamActive]);

  // Explicit guard conditions derived from real application state
  const canContinueFromPrivacy = privacyAcknowledged;

  const canContinueFromCameraPermission =
    permissionState === 'Permission granted' &&
    (isStreamActive || CameraService.getInstance().isStreamActive());

  const canContinueFromFacePositioning =
    (canContinueFromCameraPermission &&
      faceEval.canContinueFromFacePositioning &&
      faceEval.completedStepIds.length === faceEval.totalSteps) ||
    calibrationScreenPhase === 'skipped';

  const canContinueFromEyeAlignment =
    canContinueFromCameraPermission &&
    eyeEval.faceDetected &&
    eyeEval.bothEyesDetected &&
    eyeEval.bothEyesReliable &&
    eyeEval.eyeMidpointInsideArea &&
    eyeEval.headRotationValid &&
    eyeEval.eyeLevelAligned &&
    eyeEval.eyeDetectionStable;

  const canFinishCalibration =
    canContinueFromCameraPermission &&
    calibrationState.calibrationSucceeded &&
    calibrationState.calibrationSaved;

  // Step 1 -> Step 2
  const handleFromWelcome = () => {
    setStep('privacy');
    setAnnouncement('Step 2 of 6: Your camera. Your device.');
  };

  // Step 2 -> Step 3
  const handleTogglePrivacy = (checked: boolean) => {
    setPrivacyAcknowledged(checked);
    if (checked) {
      OnboardingSetupStorage.markPrivacyAcknowledged();
    }
  };

  const handleFromPrivacy = () => {
    if (!canContinueFromPrivacy) return;
    OnboardingSetupStorage.markPrivacyAcknowledged();
    setStep('cameraPermission');
    setAnnouncement('Step 3 of 6: Let’s check your camera.');
  };

  // Step 3: Request real camera permission
  const handleEnableCamera = async () => {
    try {
      let targetEl = hiddenCaptureVideoRef.current;
      if (!targetEl) {
        targetEl = document.createElement('video');
        targetEl.playsInline = true;
        targetEl.muted = true;
      }
      await startCamera(targetEl);
      OnboardingSetupStorage.markCameraPermissionGranted(true);
      setAnnouncement('Camera permission granted.');
    } catch {
      OnboardingSetupStorage.markCameraPermissionGranted(false);
      setAnnouncement('Camera access could not be enabled.');
    }
  };

  // Step 3 -> Step 4 (Intro phase)
  const handleFromCameraPermission = () => {
    if (!canContinueFromCameraPermission) return;
    OnboardingSetupStorage.markCameraPermissionGranted(true);
    visionEvaluatorRef.current.resetFaceState();
    frameValidatorRef.current.reset();
    setFaceEval(INITIAL_FACE_EVAL);
    setCalibrationScreenPhase('intro');
    setStep('facePositioning');
    setAnnouncement('Step 4 of 6: Find your position.');
  };

  // Step 4: Start Guided Scanning from Intro
  const handleStartScanning = useCallback(() => {
    visionEvaluatorRef.current.resetFaceState();
    frameValidatorRef.current.reset();
    setFaceEval(INITIAL_FACE_EVAL);
    setCalibrationScreenPhase('scanning');
    lastAnnouncedStepRef.current = 'fit';
    setAnnouncement(
      `Step 1 of ${GUIDED_FACE_CHECK_STEPS.length}, ${GUIDED_FACE_CHECK_STEPS[0].instruction.toLowerCase()}.`
    );
  }, []);

  // Step 4: Back / Cancel to Intro
  const handleCancelToIntro = useCallback(() => {
    visionEvaluatorRef.current.resetFaceState();
    frameValidatorRef.current.reset();
    setFaceEval(INITIAL_FACE_EVAL);
    setCalibrationScreenPhase('intro');
    lastAnnouncedStepRef.current = '';
    setAnnouncement('Returned to calibration intro.');
  }, []);

  // Step 4: Restart Guided Calibration
  const handleRestartFacePositioning = useCallback(() => {
    visionEvaluatorRef.current.resetFaceState();
    frameValidatorRef.current.reset();
    OnboardingSetupStorage.invalidateCalibration();
    setFaceEval(INITIAL_FACE_EVAL);
    setCalibrationScreenPhase('scanning');
    lastAnnouncedStepRef.current = 'fit';
    setAnnouncement(
      `Calibration restarted. Step 1 of ${GUIDED_FACE_CHECK_STEPS.length}, ${GUIDED_FACE_CHECK_STEPS[0].instruction.toLowerCase()}.`
    );
  }, []);

  // Step 4: Skip for now (when a step times out)
  const handleSkipCalibration = useCallback(() => {
    OnboardingSetupStorage.invalidateCalibration();
    setCalibrationScreenPhase('skipped');
    setAnnouncement(
      'Calibration skipped for now. Personalization and distance estimates will be limited.'
    );
  }, []);

  // Step 4 -> Next step
  const handleFromFacePositioning = () => {
    if (!canContinueFromFacePositioning) return;
    if (calibrationScreenPhase === 'skipped') {
      // Stop camera tracks when exiting skipped calibration
      stopCamera();
      onComplete(null);
      return;
    }
    visionEvaluatorRef.current.resetEyeState();
    setEyeEval((prev) => ({
      ...prev,
      faceDetected: faceEval.faceDetected,
      detectionState: 'Face detected',
      faceBox: faceEval.faceBox,
      leftEye: faceEval.leftEye,
      rightEye: faceEval.rightEye,
      eyeLevelY: faceEval.eyeLevelY,
    }));
    setStep('eyeAlignment');
    setAnnouncement('Step 5 of 6: Align your eyes.');
  };

  // Step 5 -> Step 6
  const handleFromEyeAlignment = () => {
    if (!canContinueFromEyeAlignment) return;
    visionEvaluatorRef.current.resetCalibrationState();
    setCalibrationState(INITIAL_CALIBRATION_STATE);
    setStep('calibration');
    setAnnouncement('Step 6 of 6: Calibrating your reference position.');
  };

  // Step 6 Retry handler
  const handleRetryCalibration = useCallback(() => {
    visionEvaluatorRef.current.resetCalibrationState();
    frameValidatorRef.current.reset();
    setCalibrationState(INITIAL_CALIBRATION_STATE);
    setAnnouncement('Retrying position calibration.');
  }, []);

  // Step 6 -> Complete
  const handleFromCalibration = useCallback(() => {
    if (!canFinishCalibration) return;
    OnboardingSetupStorage.markSetupComplete();
    setStep('complete');
    setAnnouncement("You're all set. Calibration saved.");
  }, [canFinishCalibration]);

  // Auto-advance to completion screen briefly after Step 6 calibration is saved
  useEffect(() => {
    if (
      step === 'calibration' &&
      calibrationState.calibrationSucceeded &&
      calibrationState.calibrationSaved
    ) {
      const timer = setTimeout(() => {
        OnboardingSetupStorage.markSetupComplete();
        setStep('complete');
        setAnnouncement("You're all set. Calibration saved.");
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [
    step,
    calibrationState.calibrationSucceeded,
    calibrationState.calibrationSaved,
  ]);

  // Real-time MediaPipe vision loop for Steps 4 (scanning), 5, and 6
  useEffect(() => {
    if (
      (step === 'facePositioning' && calibrationScreenPhase !== 'scanning') ||
      (step !== 'facePositioning' &&
        step !== 'eyeAlignment' &&
        step !== 'calibration')
    ) {
      return;
    }

    const currentLoopId = ++loopGenerationRef.current;
    let animId: number;
    let isCancelled = false;
    let lastProcessedVideoTime = -1;
    let lastInferenceTimestamp = 0;
    let lastUiUpdateTimestamp = 0;

    const landmarker = landmarkerRef.current;
    const evaluator = visionEvaluatorRef.current;
    const validator = frameValidatorRef.current;

    if (!landmarker.isReady()) {
      landmarker.initialize().catch(() => {});
    }

    const tick = () => {
      if (isCancelled || loopGenerationRef.current !== currentLoopId) {
        return;
      }

      const nowMs = performance.now();
      const videoEl = previewVideoRef.current || hiddenCaptureVideoRef.current;
      const activeStream = CameraService.getInstance().getStream();
      const streamLive = CameraService.getInstance().isStreamActive();

      if (videoEl && activeStream) {
        if (videoEl.srcObject !== activeStream) {
          videoEl.srcObject = activeStream;
        }
        if (videoEl.paused && !videoEl.ended) {
          videoEl.play().catch(() => {});
        }
      }

      const detectorStatus = landmarker.getStatus();
      const hasError =
        cameraStatus === 'error' ||
        !!cameraError ||
        detectorStatus === 'error';

      const videoHasDimensions =
        !!videoEl &&
        videoEl.readyState >= 2 &&
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0;

      // 1. Check for camera or detector error
      if (hasError) {
        if (step === 'facePositioning') {
          setFaceEval(
            evaluator.evaluateFacePositioning(null, 0, nowMs, false, 'error')
          );
        } else if (step === 'eyeAlignment') {
          setEyeEval(
            evaluator.evaluateEyeAlignment(null, 0, nowMs, false, 'error')
          );
        } else if (step === 'calibration') {
          setCalibrationState(
            evaluator.processCalibrationFrame(
              null,
              0,
              nowMs,
              false,
              false,
              distanceEstimatorRef.current
            )
          );
        }
        animId = requestAnimationFrame(tick);
        return;
      }

      // 2. Wait until camera stream is active and video has decoded dimensions
      if (!streamLive || !videoHasDimensions || !videoEl) {
        if (nowMs - lastUiUpdateTimestamp >= 120) {
          lastUiUpdateTimestamp = nowMs;
          if (step === 'facePositioning') {
            setFaceEval(
              evaluator.evaluateFacePositioning(
                null,
                0,
                nowMs,
                false,
                'initializing_camera'
              )
            );
          } else if (step === 'eyeAlignment') {
            setEyeEval(
              evaluator.evaluateEyeAlignment(
                null,
                0,
                nowMs,
                false,
                'initializing_camera'
              )
            );
          }
        }
        animId = requestAnimationFrame(tick);
        return;
      }

      // 3. Wait until MediaPipe FaceLandmarker model is ready
      if (!landmarker.isReady()) {
        if (nowMs - lastUiUpdateTimestamp >= 120) {
          lastUiUpdateTimestamp = nowMs;
          if (step === 'facePositioning') {
            setFaceEval(
              evaluator.evaluateFacePositioning(
                null,
                0,
                nowMs,
                true,
                'loading_detector'
              )
            );
          } else if (step === 'eyeAlignment') {
            setEyeEval(
              evaluator.evaluateEyeAlignment(
                null,
                0,
                nowMs,
                true,
                'loading_detector'
              )
            );
          }
        }
        animId = requestAnimationFrame(tick);
        return;
      }

      // 4. Process only when a new video frame is decoded (or >= 30ms elapsed)
      const currentVideoTime = videoEl.currentTime;
      const isNewVideoFrame =
        Math.abs(currentVideoTime - lastProcessedVideoTime) > 0.0001 ||
        nowMs - lastInferenceTimestamp >= 32;

      if (isNewVideoFrame) {
        lastProcessedVideoTime = currentVideoTime;
        lastInferenceTimestamp = nowMs;

        const isLiveFrame = validator.validateVideoElement(videoEl);
        const detection = isLiveFrame
          ? landmarker.detectVideoFrame(videoEl, 0)
          : null;

        const landmarks = detection?.landmarks ?? null;
        const confidence =
          detection?.confidence ?? (landmarks && landmarks.length >= 468 ? 0.92 : 0);

        const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
        const containerW = videoEl.clientWidth || 400;
        const containerH = videoEl.clientHeight || 300;
        const containerAspect = containerH > 0 ? containerW / containerH : 4 / 3;

        if (step === 'facePositioning') {
          const nextFace = evaluator.evaluateFacePositioning(
            landmarks,
            confidence,
            nowMs,
            isLiveFrame,
            'ready',
            videoAspect,
            containerAspect,
            distanceEstimatorRef.current
          );

          // Announce step transitions in polite live region
          if (
            nextFace.currentStepId !== lastAnnouncedStepRef.current &&
            nextFace.currentStepId !== 'completed'
          ) {
            lastAnnouncedStepRef.current = nextFace.currentStepId;
            setAnnouncement(
              `Step ${nextFace.currentStepIndex + 1} of ${nextFace.totalSteps}, ${nextFace.instruction.toLowerCase()}.`
            );
          }

          // Trigger Face ID-style completion animation once when all 5 steps complete
          if (
            nextFace.canContinueFromFacePositioning &&
            nextFace.completedStepIds.length === nextFace.totalSteps
          ) {
            setFaceEval(nextFace);
            setCalibrationScreenPhase('completing');
            lastAnnouncedStepRef.current = 'completed';
            setAnnouncement('Calibration complete.');
            return;
          }

          // Throttle high-frequency coordinate state updates to ~15 Hz unless discrete state changed
          if (
            nowMs - lastUiUpdateTimestamp >= 64 ||
            nextFace.currentStepId !== faceEval.currentStepId ||
            nextFace.stepSatisfied !== faceEval.stepSatisfied ||
            nextFace.stepTimedOut !== faceEval.stepTimedOut
          ) {
            lastUiUpdateTimestamp = nowMs;
            setFaceEval(nextFace);
          }
        } else if (step === 'eyeAlignment') {
          const nextEye = evaluator.evaluateEyeAlignment(
            landmarks,
            confidence,
            nowMs,
            isLiveFrame,
            'ready',
            videoAspect,
            containerAspect
          );
          if (nowMs - lastUiUpdateTimestamp >= 64 || nextEye.canContinueFromEyeAlignment !== eyeEval.canContinueFromEyeAlignment) {
            lastUiUpdateTimestamp = nowMs;
            setEyeEval(nextEye);
          }
        } else if (step === 'calibration') {
          const nextEye = evaluator.evaluateEyeAlignment(
            landmarks,
            confidence,
            nowMs,
            isLiveFrame,
            'ready',
            videoAspect,
            containerAspect
          );
          setEyeEval(nextEye);

          const nextCalib = evaluator.processCalibrationFrame(
            landmarks,
            confidence,
            nowMs,
            isLiveFrame,
            streamLive,
            distanceEstimatorRef.current,
            videoAspect,
            containerAspect
          );
          setCalibrationState(nextCalib);
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animId);
    };
  }, [step, calibrationScreenPhase, cameraStatus, cameraError]);

  // Final action: Open Dashboard
  const handleOpenDashboard = () => {
    if (!calibrationState.calibrationSaved && !OnboardingSetupStorage.isCalibrationValid()) {
      return;
    }
    OnboardingSetupStorage.markSetupComplete();
    onComplete(
      calibrationState.savedMetadata ||
        faceEval.savedMetadata ||
        OnboardingSetupStorage.getRecord().calibrationMetadata
    );
  };

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between transition-colors duration-200 ${tokens.pageShell}`}
    >
      {/* Polite screen-reader live announcement region */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Hidden video element used during Step 3 permission verification */}
      <video
        ref={hiddenCaptureVideoRef}
        className="fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none"
        playsInline
        muted
        autoPlay
      />

      {/* Top Onboarding Header with Brand, Step Progress, and Visual Style Switcher */}
      <header className={`w-full px-4 sm:px-8 py-3.5 ${tokens.headerBar}`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <OrbitingEyeLogo size={28} className="w-7 h-7" />
            <span className={`${tokens.headingFont} text-base tracking-tight`}>
              IRIS
            </span>
          </div>

          {/* Step Indicator */}
          <div className="flex-1 max-w-md mx-auto">
            <OnboardingProgress currentStep={step} tokens={tokens} />
          </div>

          {/* Visual Style Switcher (Vivid / Minimal) */}
          <div
            role="group"
            aria-label="Visual style"
            className={
              isVivid
                ? 'flex items-center gap-1 p-1 rounded-full bg-white dark:bg-[#181818] border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)] shrink-0'
                : 'flex items-center gap-1 p-1 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] shrink-0'
            }
          >
            {(['vivid', 'minimal'] as StyleMode[]).map((mode) => {
              const active = styleMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setStyleMode(mode)}
                  aria-pressed={active}
                  className={
                    isVivid
                      ? `px-3 py-1 text-xs font-dm font-bold rounded-full capitalize transition-all cursor-pointer ${
                          tokens.focusRing
                        } ${
                          active
                            ? 'bg-[#FF851B] text-black border-2 border-black shadow-[1px_1px_0px_#000000]'
                            : 'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] border-2 border-transparent'
                        }`
                      : `px-2.5 py-1 text-xs font-semibold rounded-md capitalize transition-colors cursor-pointer ${
                          tokens.focusRing
                        } ${
                          active
                            ? 'bg-white text-[#0F172A] shadow-xs'
                            : 'text-[#64748B] hover:text-[#0F172A]'
                        }`
                  }
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Step Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex items-center justify-center">
        {step === 'welcome' && (
          <WelcomeStep onGetStarted={handleFromWelcome} tokens={tokens} />
        )}

        {step === 'privacy' && (
          <PrivacyPolicyStep
            acknowledged={privacyAcknowledged}
            onToggleAcknowledged={handleTogglePrivacy}
            onContinue={handleFromPrivacy}
            tokens={tokens}
          />
        )}

        {step === 'cameraPermission' && (
          <CameraPermissionStep
            permissionState={permissionState}
            isStreamActive={canContinueFromCameraPermission}
            errorMessage={cameraError}
            recoveryReason={recoveryReason}
            onEnableCamera={handleEnableCamera}
            onContinue={handleFromCameraPermission}
            tokens={tokens}
          />
        )}

        {step === 'facePositioning' && (
          <CameraPositionStep
            videoRef={previewVideoRef}
            evaluation={faceEval}
            phase={calibrationScreenPhase}
            recoveryReason={recoveryReason}
            onStartScanning={handleStartScanning}
            onCancelToIntro={handleCancelToIntro}
            onRestart={handleRestartFacePositioning}
            onSkipCalibration={handleSkipCalibration}
            onContinue={handleFromFacePositioning}
            tokens={tokens}
          />
        )}

        {step === 'eyeAlignment' && (
          <EyeAlignmentStep
            videoRef={previewVideoRef}
            evaluation={eyeEval}
            onContinue={handleFromEyeAlignment}
            tokens={tokens}
          />
        )}

        {step === 'calibration' && (
          <CalibrationStep
            videoRef={previewVideoRef}
            calibrationState={calibrationState}
            faceBox={eyeEval.faceBox || faceEval.faceBox}
            faceCenter={eyeEval.eyeMidpoint || faceEval.faceCenter}
            leftEye={eyeEval.leftEye || faceEval.leftEye}
            rightEye={eyeEval.rightEye || faceEval.rightEye}
            eyeLevelY={eyeEval.eyeLevelY || faceEval.eyeLevelY}
            faceDetected={eyeEval.faceDetected || faceEval.faceDetected}
            onStartOrRetryCalibration={handleRetryCalibration}
            onContinueToComplete={handleFromCalibration}
            tokens={tokens}
          />
        )}

        {step === 'complete' && (
          <SetupCompleteStep
            calibrationMetadata={
              calibrationState.savedMetadata ||
              faceEval.savedMetadata ||
              OnboardingSetupStorage.getRecord().calibrationMetadata
            }
            onOpenDashboard={handleOpenDashboard}
            tokens={tokens}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className={`w-full py-4 px-6 text-center text-xs ${tokens.mutedText}`}>
        <span>Local-only camera processing · No video stored or transmitted</span>
      </footer>
    </div>
  );
};
