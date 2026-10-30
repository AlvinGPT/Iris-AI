import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronDown,
  Shield,
  RotateCcw,
  Eye,
  Camera,
  CameraOff,
  Check,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { TelemetryState } from '../types';
import {
  ROUTINES,
  ROUTINE_ORDER,
  EXERCISES,
  CLIP_MANIFEST,
  GLOBAL_PRECAUTIONS,
  COMPLETION_CAPTION,
  MASCOT_STILL_FALLBACK,
  OCURE_SESSION_VOICE_SCRIPTS,
  buildCombinedLiveStatusVoiceUpdate,
  buildStepMidNudgeText,
  OcureVoiceDeliveryContext,
  RoutineRecord,
  ExerciseRecord,
  GuidedStepPhaseCue,
  getGuidedCuesForExercise,
} from '../data/ocureExercises';
import {
  classifyBlinkRate,
  selectNextRoutine,
  OcureDailyPlanService,
  DailyPlanState,
  ExerciseSessionRecord,
  getLocalDateOrdinal,
  OCURE_CONFIG,
  CameraCheckStatus,
  CameraCheckStatusLine,
  OcureExerciseVerificationMachine,
  ExerciseVerificationSnapshot,
  isOpenCloseEyeExercise,
  isExerciseVerifiable,
  ACTIVITY_PAUSED_MESSAGE,
  FACE_LOST_PAUSED_MESSAGE,
  getStoredCameraCheckPref,
  setStoredCameraCheckPref,
} from '../services/ocureService';
import { ocureVoiceService } from '../services/ocureVoiceService';

export type SessionState =
  | 'ready'
  | 'intro'
  | 'countdown'
  | 'step_running'
  | 'awaiting_user'
  | 'paused'
  | 'completed'
  | 'stopped_early';

interface OcureScreenProps {
  telemetry: TelemetryState;
  onBackToDashboard?: () => void;
  onSelectTab?: (tab: any) => void;
  initialRoutineId?: string;
  onSessionStateChange?: (isActive: boolean) => void;
  onSessionFinished?: () => void;
  isMonitoring?: boolean;
  cameraStatus?: string;
  cameraError?: string | null;
  onStartMonitoring?: () => Promise<void>;
  onStopMonitoring?: () => void;
}

export const OcureScreen: React.FC<OcureScreenProps> = ({
  telemetry,
  initialRoutineId = 'R1',
  onSessionStateChange,
  onSessionFinished,
  isMonitoring,
  cameraStatus = 'idle',
  cameraError = null,
  onStartMonitoring,
  onStopMonitoring,
}) => {
  const { isMinimal, isDark } = useTheme();

  // Ensure scroll position resets to top immediately upon entering the tab
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  // Daily plan state
  const [dailyPlan, setDailyPlan] = useState<DailyPlanState>(() =>
    OcureDailyPlanService.getDailyPlan()
  );

  // Refresh daily plan periodically to catch local midnight rollover
  useEffect(() => {
    const refreshPlan = () => {
      setDailyPlan(OcureDailyPlanService.getDailyPlan());
    };
    refreshPlan();
    const id = setInterval(refreshPlan, 5000);
    return () => clearInterval(id);
  }, []);

  const completedBreaksToday = Math.min(
    OCURE_CONFIG.MAX_DAILY_BREAKS,
    Math.max(0, dailyPlan.completedBreakCount ?? dailyPlan.completedRoutineIds.length)
  );
  const isDailyLimitReached = completedBreaksToday >= OCURE_CONFIG.MAX_DAILY_BREAKS;

  // Evaluate latest reliable band using app's telemetry
  const classification = classifyBlinkRate(
    telemetry.avgBlinkRate,
    telemetry.observationSeconds,
    telemetry.trackingCoveragePct ?? 100
  );

  // Suggested next routine calculated deterministically from current telemetry & daily plan
  const suggestedRoutine = selectNextRoutine({
    todayUsedRoutineIds: Array.from(
      new Set([...dailyPlan.completedRoutineIds, ...(dailyPlan.usedRoutineIds || [])])
    ),
    todayOfferedRoutineIds: dailyPlan.offeredRoutineIds,
    latestReliableBand: classification.band,
    localDateOrdinal: getLocalDateOrdinal(),
    yesterdayFirstOfferedRoutineId: null,
  });

  // Recommended routine: pending offer routine if available, else suggestedRoutine, else fallback
  const recommendedRoutineId = suggestedRoutine?.id || initialRoutineId || 'R1';
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>(recommendedRoutineId);
  const [isRoutinePopoverOpen, setIsRoutinePopoverOpen] = useState<boolean>(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const activeRoutine: RoutineRecord = ROUTINES[selectedRoutineId] || ROUTINES['R1'];

  // Session state machine: ready -> intro -> countdown -> step_running <-> paused | awaiting_user -> completed | stopped_early
  const [sessionState, setSessionState] = useState<SessionState>('ready');
  const [countdownNum, setCountdownNum] = useState<number>(3);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0); // 0..3
  const [stepElapsedSeconds, setStepElapsedSeconds] = useState<number>(0);
  const [stepOutcomes, setStepOutcomes] = useState<Array<'finished' | 'skipped'>>([]);
  const [showPrecautions, setShowPrecautions] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [stoppedEarlyReason, setStoppedEarlyReason] = useState<string | null>(null);
  const [cameraCheckEnabled, setCameraCheckEnabled] = useState<boolean>(() =>
    getStoredCameraCheckPref()
  );
  const cameraCheckEnabledRef = useRef<boolean>(cameraCheckEnabled);
  useEffect(() => {
    cameraCheckEnabledRef.current = cameraCheckEnabled;
  }, [cameraCheckEnabled]);

  // Active exercise verification state machine instance
  const verifierRef = useRef<OcureExerciseVerificationMachine>(
    new OcureExerciseVerificationMachine('blink_complete', 30)
  );
  const [verificationSnapshot, setVerificationSnapshot] = useState<ExerciseVerificationSnapshot>(
    () =>
      new OcureExerciseVerificationMachine(
        activeRoutine.steps[0]?.exerciseId || 'blink_complete',
        30
      ).tick({
        timestampMs: performance.now(),
        isMonitoring: false,
        cameraStatus: 'idle',
        faceDetected: false,
        isReliable: false,
        combinedAperture: 0.28,
        closureThresholdEAR: 0.23,
        reopenThresholdEAR: 0.25,
        eyeClosureScore: 0,
        blinkState: 'OPEN',
      })
  );

  // Monotonic Session Clock (single source of truth: elapsed = now - start - totalPausedTime)
  const sessionStartMsRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  const pauseStartMsRef = useRef<number | null>(null);

  // Unique session ID per run to guarantee idempotent completion recording
  const activeSessionIdRef = useRef<string>('');
  const sessionCompletedRecordedRef = useRef<boolean>(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const midStepNudgeSpokenStepRef = useRef<number>(-1);

  // Coach voice preference & runtime state
  const [voiceAvailable] = useState<boolean>(() => ocureVoiceService.isAvailable());
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => ocureVoiceService.isEnabled());
  const [isCoachSpeaking, setIsCoachSpeaking] = useState<boolean>(() =>
    ocureVoiceService.isSpeaking()
  );
  const [lastSpokenLineText, setLastSpokenLineText] = useState<string>('');
  const lastSpokenCueKeyRef = useRef<string>('');

  const getActiveGuidedCue = useCallback(
    (
      exerciseId: string,
      stepIdx: number,
      elapsedSec: number
    ): { cue: GuidedStepPhaseCue; cueIdx: number } => {
      const cues = getGuidedCuesForExercise(exerciseId, stepIdx);
      let activeIdx = 0;
      for (let i = 0; i < cues.length; i++) {
        if (elapsedSec >= cues[i].atSec) {
          activeIdx = i;
        } else {
          break;
        }
      }
      return { cue: cues[activeIdx] || cues[0], cueIdx: activeIdx };
    },
    []
  );

  useEffect(() => {
    const unsubSpeak = ocureVoiceService.subscribeSpeakingState(setIsCoachSpeaking);
    const unsubText = ocureVoiceService.subscribeUtteranceText((text) => {
      setLastSpokenLineText(text);
    });
    return () => {
      unsubSpeak();
      unsubText();
      if (introTimerRef.current) {
        clearTimeout(introTimerRef.current);
      }
      ocureVoiceService.cancel();
    };
  }, []);

  // Per-step tracking of camera check outcomes, checkPauseCounts, reminderCounts, and completed cycles
  const [stepCameraChecks, setStepCameraChecks] = useState<CameraCheckStatus[]>([]);
  const [stepCheckPauseCounts, setStepCheckPauseCounts] = useState<number[]>([0, 0, 0, 0]);
  const [stepReminderCounts, setStepReminderCounts] = useState<number[]>([0, 0, 0, 0]);
  const [stepCycleCounts, setStepCycleCounts] = useState<number[]>([0, 0, 0, 0]);

  const stepCameraChecksRef = useRef<CameraCheckStatus[]>([]);
  const stepCheckPauseCountsRef = useRef<number[]>([0, 0, 0, 0]);
  const stepReminderCountsRef = useRef<number[]>([0, 0, 0, 0]);
  const stepCycleCountsRef = useRef<number[]>([0, 0, 0, 0]);

  const cameraStartedByCoachRef = useRef<boolean>(false);
  const onStopMonitoringRef = useRef(onStopMonitoring);
  useEffect(() => {
    onStopMonitoringRef.current = onStopMonitoring;
  }, [onStopMonitoring]);

  // Privacy guard: stop camera on unmount if it was started specifically for the OCURE exercise
  useEffect(() => {
    return () => {
      if (cameraStartedByCoachRef.current) {
        cameraStartedByCoachRef.current = false;
        onStopMonitoringRef.current?.();
      }
    };
  }, []);

  // Check prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsRoutinePopoverOpen(false);
      }
    };
    if (isRoutinePopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRoutinePopoverOpen]);

  // Tell parent whether coach session is actively running
  const onSessionStateChangeRef = useRef(onSessionStateChange);
  useEffect(() => {
    onSessionStateChangeRef.current = onSessionStateChange;
  }, [onSessionStateChange]);

  useEffect(() => {
    const isRunning =
      sessionState === 'intro' ||
      sessionState === 'countdown' ||
      sessionState === 'step_running' ||
      sessionState === 'awaiting_user' ||
      sessionState === 'paused';
    onSessionStateChangeRef.current?.(isRunning);
  }, [sessionState]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadedClipFileRef = useRef<string>('');

  // Synchronized telemetry and monitoring refs for high-frequency evaluator
  const telemetryRef = useRef(telemetry);
  const lastTelemetryUpdateMsRef = useRef<number>(performance.now());
  useEffect(() => {
    telemetryRef.current = telemetry;
    lastTelemetryUpdateMsRef.current = performance.now();
  }, [telemetry]);

  const isMonitoringActive = isMonitoring ?? telemetry.isMonitoring;
  const isMonitoringRef = useRef(isMonitoringActive);
  useEffect(() => {
    isMonitoringRef.current = isMonitoringActive;
  }, [isMonitoringActive]);

  const cameraStatusRef = useRef(cameraStatus);
  useEffect(() => {
    cameraStatusRef.current = cameraStatus;
  }, [cameraStatus]);

  // Preload video helper
  const preloadClip = useCallback((clipFile: string) => {
    if (typeof document === 'undefined') return;
    const preloader = document.createElement('video');
    preloader.src = clipFile;
    preloader.preload = 'auto';
    preloader.load();
  }, []);

  // Current active step exercise & active guided phase cue
  const currentStep = activeRoutine.steps[currentStepIdx] || activeRoutine.steps[0];
  const currentExercise: ExerciseRecord =
    EXERCISES[currentStep.exerciseId] || EXERCISES['blink_complete'];
  const { cue: currentGuidedCue } = getActiveGuidedCue(
    currentStep.exerciseId,
    currentStepIdx,
    stepElapsedSeconds
  );
  const currentStepSpokenInstruction = currentGuidedCue.spokenText;

  // Preload upcoming step voice cues just-in-time during active sessions
  useEffect(() => {
    if (!voiceAvailable || !voiceEnabled) return;

    if (sessionState === 'countdown') {
      const preloadItems: Array<{ text: string; context?: OcureVoiceDeliveryContext }> = [];
      const firstStep = activeRoutine.steps[0];
      if (firstStep) {
        const firstStepCues = getGuidedCuesForExercise(firstStep.exerciseId, 0);
        for (const c of firstStepCues) {
          preloadItems.push({ text: c.spokenText, context: c.context || 'instruction' });
        }
      }
      ocureVoiceService.preloadRoutineCues(preloadItems);
      return;
    }

    if (sessionState === 'step_running' || sessionState === 'awaiting_user') {
      const preloadItems: Array<{
        text: string;
        context?: OcureVoiceDeliveryContext;
      }> = [];

      const currentCues = getGuidedCuesForExercise(currentStep.exerciseId, currentStepIdx);
      for (const c of currentCues) {
        preloadItems.push({ text: c.spokenText, context: c.context || 'instruction' });
      }

      if (currentStepIdx < activeRoutine.steps.length - 1) {
        const nextIdx = currentStepIdx + 1;
        const nextStep = activeRoutine.steps[nextIdx];
        if (nextStep) {
          const nextCues = getGuidedCuesForExercise(nextStep.exerciseId, nextIdx);
          for (const c of nextCues) {
            preloadItems.push({ text: c.spokenText, context: c.context || 'instruction' });
          }
        }
      } else {
        preloadItems.push({
          text: OCURE_SESSION_VOICE_SCRIPTS.routine_complete.spokenText,
          context: OCURE_SESSION_VOICE_SCRIPTS.routine_complete.context,
        });
      }

      ocureVoiceService.preloadRoutineCues(preloadItems);
    }
  }, [
    sessionState,
    currentStepIdx,
    activeRoutine,
    currentStep.exerciseId,
    voiceAvailable,
    voiceEnabled,
  ]);

  // Initialize and start the verification state machine and first guided phase cue whenever a step starts
  const startStepVerifier = useCallback(
    (stepIdx: number) => {
      const step = activeRoutine.steps[stepIdx] || activeRoutine.steps[0];
      const cues = getGuidedCuesForExercise(step.exerciseId, stepIdx);
      const initialCue = cues[0];

      midStepNudgeSpokenStepRef.current = -1;
      verifierRef.current.reset(step.exerciseId, step.durationSeconds || 30);
      const initialSnap = verifierRef.current.start(
        performance.now(),
        initialCue.spokenText
      );
      setVerificationSnapshot(initialSnap);
      setStepElapsedSeconds(0);

      const cueKey = `${stepIdx}_0`;
      lastSpokenCueKeyRef.current = cueKey;
      setLastSpokenLineText(initialCue.spokenText);

      const promptId = `${activeRoutine.id}_step_${stepIdx + 1}_cue_0`;
      ocureVoiceService.recordRepeatableInstruction(
        promptId,
        initialCue.spokenText,
        initialCue.context || 'instruction'
      );
      // OCURE_VOICE.md §1 & §2: Step-start instruction uses priority 'step_instruction'
      // (waits up to 3s for any active line to finish naturally, never cutting off speech)
      ocureVoiceService.speak(promptId, initialCue.spokenText, {
        interrupt: false,
        priority: 'step_instruction',
        recordAsRepeatable: true,
        context: initialCue.context || 'instruction',
      });
    },
    [activeRoutine.id, activeRoutine.steps]
  );

  // Current clip id determination
  let currentClipId = 'idle_loop';
  if (
    sessionState === 'step_running' ||
    sessionState === 'awaiting_user' ||
    sessionState === 'paused'
  ) {
    currentClipId = currentExercise.clipId;
  } else if (sessionState === 'completed') {
    currentClipId = 'coach_complete';
  }
  const currentClipManifest = CLIP_MANIFEST[currentClipId] || CLIP_MANIFEST['idle_loop'];

  // Video source loading & loop synchronized with step state (always muted, volume 0)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (loadedClipFileRef.current !== currentClipManifest.file) {
      loadedClipFileRef.current = currentClipManifest.file;
      setVideoError(false);
      video.src = currentClipManifest.file;
      video.loop = currentClipManifest.loop;
      video.muted = true;
      video.volume = 0;
      video.playsInline = true;
      video.load();
    } else {
      video.loop = currentClipManifest.loop;
      video.muted = true;
      video.volume = 0;
      video.playsInline = true;
    }

    if (
      !prefersReducedMotion &&
      (sessionState === 'step_running' ||
        sessionState === 'ready' ||
        sessionState === 'intro' ||
        sessionState === 'completed')
    ) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [
    currentClipManifest.file,
    currentClipManifest.loop,
    sessionState,
    prefersReducedMotion,
  ]);

  // Preload next step clip during current step execution
  useEffect(() => {
    if (
      (sessionState === 'step_running' || sessionState === 'awaiting_user') &&
      currentStepIdx < activeRoutine.steps.length - 1
    ) {
      const nextStep = activeRoutine.steps[currentStepIdx + 1];
      const nextExercise = EXERCISES[nextStep.exerciseId];
      if (nextExercise) {
        const nextManifest = CLIP_MANIFEST[nextExercise.clipId];
        if (nextManifest) {
          preloadClip(nextManifest.file);
        }
      }
    }
  }, [sessionState, currentStepIdx, activeRoutine, preloadClip]);

  // Routine completion helper
  const completeSessionIdempotent = useCallback(() => {
    if (sessionCompletedRecordedRef.current) return;
    sessionCompletedRecordedRef.current = true;

    if (cameraStartedByCoachRef.current) {
      cameraStartedByCoachRef.current = false;
      onStopMonitoringRef.current?.();
    }

    setSessionState('completed');
    setStepElapsedSeconds(30);
    setLastSpokenLineText(OCURE_SESSION_VOICE_SCRIPTS.routine_complete.spokenText);

    ocureVoiceService.speak(
      OCURE_SESSION_VOICE_SCRIPTS.routine_complete.id,
      OCURE_SESSION_VOICE_SCRIPTS.routine_complete.spokenText,
      {
        interrupt: false,
        priority: 'step_instruction',
        recordAsRepeatable: false,
        context: OCURE_SESSION_VOICE_SCRIPTS.routine_complete.context,
      }
    );

    const totalDuration = 120;
    const sessionId = activeSessionIdRef.current || `session-${Date.now()}`;
    const recordResult = OcureDailyPlanService.recordSessionCompleted(
      activeRoutine.id,
      totalDuration,
      sessionId
    );
    setDailyPlan(OcureDailyPlanService.getDailyPlan());

    const perStepStatus = [0, 1, 2, 3].map((idx) => {
      const st = activeRoutine.steps[idx];
      const fallbackCheck: CameraCheckStatus = !cameraCheckEnabledRef.current
        ? 'check_off'
        : !isMonitoringRef.current
        ? 'camera_unavailable'
        : isExerciseVerifiable(st?.exerciseId || '')
        ? 'presence_only'
        : 'presence_only';
      return {
        stepIndex: idx + 1,
        status: (stepOutcomes[idx] || 'finished') as 'finished' | 'skipped',
        cameraCheck: stepCameraChecksRef.current[idx] || fallbackCheck,
        checkPauseCount: stepCheckPauseCountsRef.current[idx] || 0,
        reminderCount: stepReminderCountsRef.current[idx] || 0,
        promptCount:
          (stepCheckPauseCountsRef.current[idx] || 0) + (stepReminderCountsRef.current[idx] || 0),
        completedCycles: stepCycleCountsRef.current[idx] || 0,
      };
    });

    const totalCheckPauses = stepCheckPauseCountsRef.current.reduce((a, b) => a + b, 0);
    const totalReminders = stepReminderCountsRef.current.reduce((a, b) => a + b, 0);

    if (recordResult.recorded) {
      const sessionRecord: ExerciseSessionRecord = {
        id: sessionId,
        routineId: activeRoutine.id,
        bandId: classification.band,
        trigger: 'user_started',
        startedAt: Date.now() - totalDuration * 1000,
        endedAt: Date.now(),
        status: 'completed',
        perStepStatus,
        checkPauseCount: totalCheckPauses,
        reminderCount: totalReminders,
        elapsedSeconds: totalDuration,
      };
      OcureDailyPlanService.appendExerciseSession(sessionRecord);
      onSessionFinished?.();
    }
  }, [activeRoutine.id, activeRoutine.steps, classification.band, onSessionFinished, stepOutcomes]);

  const handleStopWithReason = useCallback(
    (neutralReason: string | null = null) => {
      if (introTimerRef.current) {
        clearTimeout(introTimerRef.current);
        introTimerRef.current = null;
      }
      ocureVoiceService.cancel();

      const currentCheck = verifierRef.current.getStepCameraCheckStatus(
        cameraCheckEnabledRef.current
      );
      stepCameraChecksRef.current[currentStepIdx] = currentCheck;
      stepCheckPauseCountsRef.current[currentStepIdx] = verifierRef.current.getCheckPauseCount();
      stepReminderCountsRef.current[currentStepIdx] = verifierRef.current.getReminderCount();

      setStepCameraChecks([...stepCameraChecksRef.current]);
      setStepCheckPauseCounts([...stepCheckPauseCountsRef.current]);
      setStepReminderCounts([...stepReminderCountsRef.current]);
      setStepCycleCounts([...stepCycleCountsRef.current]);

      if (cameraStartedByCoachRef.current) {
        cameraStartedByCoachRef.current = false;
        onStopMonitoringRef.current?.();
      }

      sessionStartMsRef.current = null;
      totalPausedMsRef.current = 0;
      pauseStartMsRef.current = null;
      setStoppedEarlyReason(neutralReason);
      setSessionState('stopped_early');
      if (videoRef.current) videoRef.current.pause();

      const elapsed = Math.round(currentStepIdx * 30 + stepElapsedSeconds);
      const totalCheckPauses = stepCheckPauseCountsRef.current.reduce((a, b) => a + b, 0);
      const totalReminders = stepReminderCountsRef.current.reduce((a, b) => a + b, 0);

      const sessionRecord: ExerciseSessionRecord = {
        id: `session-stop-${Date.now()}`,
        routineId: activeRoutine.id,
        bandId: classification.band,
        trigger: 'user_started',
        startedAt: Date.now() - elapsed * 1000,
        endedAt: Date.now(),
        status: 'stopped_early',
        perStepStatus: [0, 1, 2, 3].map((idx) => ({
          stepIndex: idx + 1,
          status: idx < currentStepIdx ? 'finished' : 'skipped',
          cameraCheck:
            stepCameraChecksRef.current[idx] ||
            (!cameraCheckEnabledRef.current
              ? 'check_off'
              : isMonitoringRef.current
              ? 'presence_only'
              : 'camera_unavailable'),
          checkPauseCount: stepCheckPauseCountsRef.current[idx] || 0,
          reminderCount: stepReminderCountsRef.current[idx] || 0,
          promptCount:
            (stepCheckPauseCountsRef.current[idx] || 0) +
            (stepReminderCountsRef.current[idx] || 0),
          completedCycles: stepCycleCountsRef.current[idx] || 0,
        })),
        checkPauseCount: totalCheckPauses,
        reminderCount: totalReminders,
        elapsedSeconds: elapsed,
      };
      OcureDailyPlanService.appendExerciseSession(sessionRecord);
    },
    [activeRoutine.id, classification.band, currentStepIdx, stepElapsedSeconds]
  );

  const handleStop = useCallback(() => {
    handleStopWithReason(null);
  }, [handleStopWithReason]);

  // Skip current step when skippable === true (e.g. R6 step 2 eye_closure)
  const handleSkipStep = useCallback(() => {
    if (
      (sessionState !== 'step_running' && sessionState !== 'awaiting_user') ||
      !currentStep.skippable
    ) {
      return;
    }
    ocureVoiceService.cancel();
    const checkStatus = verifierRef.current.getStepCameraCheckStatus(cameraCheckEnabledRef.current);
    stepCameraChecksRef.current[currentStepIdx] = checkStatus;
    stepCheckPauseCountsRef.current[currentStepIdx] = verifierRef.current.getCheckPauseCount();
    stepReminderCountsRef.current[currentStepIdx] = verifierRef.current.getReminderCount();

    setStepCameraChecks([...stepCameraChecksRef.current]);
    setStepCheckPauseCounts([...stepCheckPauseCountsRef.current]);
    setStepReminderCounts([...stepReminderCountsRef.current]);
    setStepOutcomes((prev) => {
      const next = [...prev];
      next[currentStepIdx] = 'skipped';
      return next;
    });

    if (currentStepIdx < 3) {
      const nextStepIdx = currentStepIdx + 1;
      if (sessionStartMsRef.current !== null) {
        sessionStartMsRef.current =
          performance.now() - (totalPausedMsRef.current + nextStepIdx * 30000);
      }
      setSessionState('step_running');
      setCurrentStepIdx(nextStepIdx);
      startStepVerifier(nextStepIdx);
    } else {
      completeSessionIdempotent();
    }
  }, [
    sessionState,
    currentStep.skippable,
    currentStepIdx,
    startStepVerifier,
    completeSessionIdempotent,
  ]);

  // Fast, Monotonic-Clock Driven Countdown (3 -> 2 -> 1 -> start step 1)
  useEffect(() => {
    if (sessionState !== 'countdown') return;

    const countdownStart = performance.now();
    let animId: number;

    const tickCountdown = () => {
      const now = performance.now();
      const elapsed = now - countdownStart;

      if (elapsed < 1000) {
        setCountdownNum(3);
        animId = requestAnimationFrame(tickCountdown);
      } else if (elapsed < 2000) {
        setCountdownNum(2);
        animId = requestAnimationFrame(tickCountdown);
      } else if (elapsed < 3000) {
        setCountdownNum(1);
        animId = requestAnimationFrame(tickCountdown);
      } else {
        sessionStartMsRef.current = performance.now();
        totalPausedMsRef.current = 0;
        pauseStartMsRef.current = null;
        setSessionState('step_running');
        setCountdownNum(3);
        startStepVerifier(0);
      }
    };

    animId = requestAnimationFrame(tickCountdown);
    return () => cancelAnimationFrame(animId);
  }, [sessionState, startStepVerifier]);

  // Real-time Exercise Verification & Monotonic Active-Time Clock Loop during step_running / awaiting_user
  useEffect(() => {
    if (sessionState !== 'step_running' && sessionState !== 'awaiting_user') return;

    let animFrameId: number;
    let lastVerifierTickMs = performance.now();

    const tick = () => {
      const now = performance.now();
      const dtMs = Math.max(0, now - lastVerifierTickMs);
      lastVerifierTickMs = now;

      const tel = telemetryRef.current;
      const snap = verifierRef.current.tick({
        timestampMs: now,
        isMonitoring: Boolean(isMonitoringRef.current),
        cameraStatus: cameraStatusRef.current || 'idle',
        faceDetected: Boolean(tel.faceDetected),
        isReliable: tel.isReliable ?? true,
        trackingQuality: tel.trackingQuality,
        combinedAperture: tel.combinedAperture ?? 0.28,
        leftEyeAperture: tel.leftEyeAperture,
        rightEyeAperture: tel.rightEyeAperture,
        closureThresholdEAR: tel.closureThresholdEAR ?? 0.23,
        reopenThresholdEAR: tel.reopenThresholdEAR ?? 0.25,
        eyeClosureScore: tel.eyeClosureScore ?? 0,
        blinkState: tel.blinkState || 'OPEN',
        headYaw: tel.headPose?.yaw ?? 0,
        headPitch: tel.headPose?.pitch ?? 0,
        headRoll: tel.headPose?.roll ?? 0,
        gazeHorizontal: tel.gazeHorizontal,
        gazeVertical: tel.gazeVertical,
        postureY: tel.postureY,
        jawRelaxScore: tel.jawRelaxScore,
        browTensionScore: tel.browTensionScore,
        faceObscured: tel.faceObscured,
        lastBlinkTimestamp: tel.lastBlinkTimestamp,
        frameAgeMs: Math.max(0, now - lastTelemetryUpdateMsRef.current),
        cameraCheckEnabled: cameraCheckEnabledRef.current,
        isSpeechActive: ocureVoiceService.isSpeaking(),
        trackerWarmingUp:
          Boolean(isMonitoringRef.current) &&
          (cameraStatusRef.current === 'active' || cameraStatusRef.current === 'running') &&
          (tel.observationSeconds ?? 0) === 0 &&
          !tel.faceDetected,
      });

      setVerificationSnapshot((prev) => {
        if (
          prev.state !== snap.state ||
          prev.statusCaption !== snap.statusCaption ||
          prev.isAwaitingUser !== snap.isAwaitingUser ||
          prev.awaitingReason !== snap.awaitingReason ||
          prev.checkPauseCount !== snap.checkPauseCount ||
          prev.reminderCount !== snap.reminderCount ||
          prev.completedCycles !== snap.completedCycles ||
          prev.verifiedActiveSeconds !== snap.verifiedActiveSeconds
        ) {
          return snap;
        }
        return prev;
      });

      // Handle 60s awaiting_user timeout (OCURE_CAMERA_CHECK.md §2C)
      if (snap.isAwaitingTimeout) {
        handleStopWithReason('Session ended after 60 seconds paused.');
        return;
      }

      // Speak any camera-check reminder or pause prompt emitted by the state machine
      if (snap.promptToSpeak) {
        setLastSpokenLineText(snap.promptToSpeak.spokenText);
        ocureVoiceService.speak(snap.promptToSpeak.id, snap.promptToSpeak.spokenText, {
          interrupt: false,
          priority:
            snap.promptToSpeak.context === 'camera_warning'
              ? 'camera_prompt'
              : 'step_instruction',
          isReminder: snap.promptToSpeak.isReminder,
          recordAsRepeatable: false,
          context: snap.promptToSpeak.context,
        });
      }

      // Synchronize sessionState between step_running and awaiting_user, and freeze clock & clip while awaiting_user
      if (snap.isAwaitingUser) {
        totalPausedMsRef.current += dtMs;
        if (sessionState !== 'awaiting_user') {
          setSessionState('awaiting_user');
        }
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
      } else {
        if (sessionState === 'awaiting_user') {
          setSessionState('step_running');
        }
        if (videoRef.current && videoRef.current.paused && !prefersReducedMotion) {
          videoRef.current.play().catch(() => {});
        }
      }

      const derivedStepElapsed = Math.min(30, snap.verifiedActiveMs / 1000);
      setStepElapsedSeconds(derivedStepElapsed);

      // Record live counts for current step
      stepCycleCountsRef.current[currentStepIdx] = snap.completedCycles;
      stepCheckPauseCountsRef.current[currentStepIdx] = snap.checkPauseCount;
      stepReminderCountsRef.current[currentStepIdx] = snap.reminderCount;

      // Handle step completion once 30s of active time has elapsed
      if (snap.verifiedActiveMs >= 30000 || snap.state === 'COMPLETED') {
        const checkOutcome = verifierRef.current.getStepCameraCheckStatus(
          cameraCheckEnabledRef.current
        );
        stepCameraChecksRef.current[currentStepIdx] = checkOutcome;
        setStepCameraChecks([...stepCameraChecksRef.current]);
        setStepCheckPauseCounts([...stepCheckPauseCountsRef.current]);
        setStepReminderCounts([...stepReminderCountsRef.current]);
        setStepCycleCounts([...stepCycleCountsRef.current]);
        setStepOutcomes((prev) => {
          const next = [...prev];
          next[currentStepIdx] = 'finished';
          return next;
        });

        if (currentStepIdx < 3) {
          const nextIdx = currentStepIdx + 1;
          setSessionState('step_running');
          setCurrentStepIdx(nextIdx);
          startStepVerifier(nextIdx);
        } else {
          completeSessionIdempotent();
        }
        return;
      }

      // Guided multi-phase cue trigger & 15s mid-step nudge within the 30s step (only while not paused)
      if (!snap.isAwaitingUser) {
        const activeStep = activeRoutine.steps[currentStepIdx] || activeRoutine.steps[0];
        const { cue, cueIdx } = getActiveGuidedCue(
          activeStep.exerciseId,
          currentStepIdx,
          derivedStepElapsed
        );
        const cueKey = `${currentStepIdx}_${cueIdx}`;
        if (lastSpokenCueKeyRef.current !== cueKey) {
          lastSpokenCueKeyRef.current = cueKey;
          setLastSpokenLineText(cue.spokenText);
          const promptId = `${activeRoutine.id}_step_${currentStepIdx + 1}_cue_${cueIdx}`;
          ocureVoiceService.recordRepeatableInstruction(
            promptId,
            cue.spokenText,
            cue.context || 'instruction'
          );
          ocureVoiceService.speak(promptId, cue.spokenText, {
            interrupt: false,
            priority: 'step_instruction',
            recordAsRepeatable: true,
            context: cue.context || 'instruction',
          });
        } else if (
          derivedStepElapsed >= OCURE_CONFIG.NUDGE_AT_SECONDS &&
          derivedStepElapsed < OCURE_CONFIG.NUDGE_AT_SECONDS + 1.0 &&
          midStepNudgeSpokenStepRef.current !== currentStepIdx
        ) {
          midStepNudgeSpokenStepRef.current = currentStepIdx;
          const nudgeText = buildStepMidNudgeText(activeStep.exerciseId);
          // OCURE_VOICE.md §2 & §4: Mid-step nudge is dropped if speech is already in progress
          if (!ocureVoiceService.isSpeaking()) {
            setLastSpokenLineText(nudgeText);
            ocureVoiceService.speak(
              `${activeRoutine.id}_step_${currentStepIdx + 1}_nudge`,
              nudgeText,
              {
                interrupt: false,
                isReminder: true,
                priority: 'mid_step_nudge',
                recordAsRepeatable: false,
                context: 'encouragement',
              }
            );
          }
        }
      }

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [
    sessionState,
    currentStepIdx,
    activeRoutine.id,
    activeRoutine.steps,
    prefersReducedMotion,
    getActiveGuidedCue,
    startStepVerifier,
    completeSessionIdempotent,
    handleStopWithReason,
  ]);

  const handlePause = useCallback(() => {
    if (sessionState === 'step_running' || sessionState === 'awaiting_user') {
      ocureVoiceService.cancel();
      const now = performance.now();
      pauseStartMsRef.current = now;
      setVerificationSnapshot(verifierRef.current.pause(now));
      setSessionState('paused');
      if (videoRef.current) videoRef.current.pause();
    }
  }, [sessionState]);

  const handleResume = useCallback(() => {
    if (sessionState === 'paused') {
      const now = performance.now();
      if (pauseStartMsRef.current !== null) {
        totalPausedMsRef.current += Math.max(0, now - pauseStartMsRef.current);
        pauseStartMsRef.current = null;
      }
      setVerificationSnapshot(verifierRef.current.resume(now));
      setSessionState('step_running');
      if (videoRef.current && !prefersReducedMotion) {
        videoRef.current.play().catch(() => {});
      }
      // OCURE_VOICE.md §2: Resume does not replay old lines. Repeat button replays current step instruction.
    }
  }, [sessionState, prefersReducedMotion]);

  const handleContinueAnyway = useCallback(() => {
    if (sessionState === 'awaiting_user' || verificationSnapshot.isAwaitingUser) {
      ocureVoiceService.cancel();
      const now = performance.now();
      const snap = verifierRef.current.continueAnyway(now);
      setVerificationSnapshot(snap);
      setSessionState('step_running');
      if (videoRef.current && !prefersReducedMotion) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [sessionState, verificationSnapshot.isAwaitingUser, prefersReducedMotion]);

  // Handle Controls: Start
  const handleStart = useCallback(() => {
    if (!OcureDailyPlanService.canStartBreakToday()) {
      setDailyPlan(OcureDailyPlanService.getDailyPlan());
      return;
    }

    if (
      cameraCheckEnabledRef.current &&
      onStartMonitoring &&
      (!isMonitoringRef.current ||
        (cameraStatusRef.current !== 'active' && cameraStatusRef.current !== 'running'))
    ) {
      cameraStartedByCoachRef.current = true;
      onStartMonitoring().catch(() => {});
    }

    OcureDailyPlanService.recordManualStart(activeRoutine.id);
    setDailyPlan(OcureDailyPlanService.getDailyPlan());

    activeSessionIdRef.current = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionCompletedRecordedRef.current = false;
    sessionStartMsRef.current = null;
    totalPausedMsRef.current = 0;
    pauseStartMsRef.current = null;
    lastSpokenCueKeyRef.current = '';
    midStepNudgeSpokenStepRef.current = -1;
    stepCameraChecksRef.current = [];
    stepCheckPauseCountsRef.current = [0, 0, 0, 0];
    stepReminderCountsRef.current = [0, 0, 0, 0];
    stepCycleCountsRef.current = [0, 0, 0, 0];

    setStoppedEarlyReason(null);
    setCurrentStepIdx(0);
    setStepElapsedSeconds(0);
    setStepOutcomes([]);
    setStepCameraChecks([]);
    setStepCheckPauseCounts([0, 0, 0, 0]);
    setStepReminderCounts([0, 0, 0, 0]);
    setStepCycleCounts([0, 0, 0, 0]);
    setCountdownNum(3);

    const introScript = OCURE_SESSION_VOICE_SCRIPTS.countdown_start;
    setLastSpokenLineText(introScript.spokenText);

    const firstStep = activeRoutine.steps[0];
    const firstEx = EXERCISES[firstStep.exerciseId];
    if (firstEx) {
      const firstManifest = CLIP_MANIFEST[firstEx.clipId];
      if (firstManifest) preloadClip(firstManifest.file);
    }

    if (introTimerRef.current) {
      clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }

    if (voiceAvailable && voiceEnabled && ocureVoiceService.isEnabled()) {
      setSessionState('intro');
      let transitioned = false;
      const startCountdownOnce = () => {
        if (transitioned) return;
        transitioned = true;
        if (introTimerRef.current) {
          clearTimeout(introTimerRef.current);
          introTimerRef.current = null;
        }
        setSessionState((prev) => (prev === 'intro' ? 'countdown' : prev));
      };

      introTimerRef.current = setTimeout(
        startCountdownOnce,
        OCURE_CONFIG.INTRO_MAX_WAIT_SECONDS * 1000
      );

      ocureVoiceService.speak(introScript.id, introScript.spokenText, {
        interrupt: true,
        forceCancelNow: true,
        recordAsRepeatable: false,
        context: introScript.context,
        onEnd: startCountdownOnce,
      });
    } else {
      setSessionState('countdown');
    }
  }, [
    onStartMonitoring,
    activeRoutine.id,
    activeRoutine.steps,
    preloadClip,
    voiceAvailable,
    voiceEnabled,
  ]);

  const handleResetToReady = () => {
    if (introTimerRef.current) {
      clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
    ocureVoiceService.cancel();
    if (cameraStartedByCoachRef.current) {
      cameraStartedByCoachRef.current = false;
      onStopMonitoringRef.current?.();
    }
    sessionStartMsRef.current = null;
    totalPausedMsRef.current = 0;
    pauseStartMsRef.current = null;
    lastSpokenCueKeyRef.current = '';
    midStepNudgeSpokenStepRef.current = -1;
    stepCameraChecksRef.current = [];
    stepCheckPauseCountsRef.current = [0, 0, 0, 0];
    stepReminderCountsRef.current = [0, 0, 0, 0];
    stepCycleCountsRef.current = [0, 0, 0, 0];
    setStoppedEarlyReason(null);
    setDailyPlan(OcureDailyPlanService.getDailyPlan());
    setSessionState('ready');
    setCurrentStepIdx(0);
    setStepElapsedSeconds(0);
    setStepOutcomes([]);
    setStepCameraChecks([]);
    setStepCheckPauseCounts([0, 0, 0, 0]);
    setStepReminderCounts([0, 0, 0, 0]);
    setStepCycleCounts([0, 0, 0, 0]);
    setLastSpokenLineText('');
  };

  const toggleVoice = () => {
    if (!voiceAvailable) return;
    const nextVal = !voiceEnabled;
    setVoiceEnabled(nextVal);
    ocureVoiceService.setEnabled(nextVal);
    if (!nextVal) {
      ocureVoiceService.cancel();
      if (sessionState === 'intro') {
        if (introTimerRef.current) {
          clearTimeout(introTimerRef.current);
          introTimerRef.current = null;
        }
        setSessionState('countdown');
      }
    }
  };

  const handleToggleCameraCheck = () => {
    const nextVal = !cameraCheckEnabled;
    setCameraCheckEnabled(nextVal);
    cameraCheckEnabledRef.current = nextVal;
    setStoredCameraCheckPref(nextVal);

    if (!nextVal) {
      if (sessionState === 'awaiting_user') {
        setSessionState('step_running');
      }
      if (cameraStartedByCoachRef.current) {
        cameraStartedByCoachRef.current = false;
        onStopMonitoringRef.current?.();
      }
    } else if (
      nextVal &&
      (sessionState === 'step_running' ||
        sessionState === 'awaiting_user' ||
        sessionState === 'countdown') &&
      onStartMonitoring &&
      !isMonitoringRef.current
    ) {
      cameraStartedByCoachRef.current = true;
      onStartMonitoring().catch(() => {});
    }
  };

  const handleRepeatInstruction = () => {
    if (!voiceAvailable) return;
    if (!voiceEnabled) {
      setVoiceEnabled(true);
      ocureVoiceService.setEnabled(true);
    }
    const repeated = ocureVoiceService.repeatCurrentInstruction();
    if (!repeated) {
      setLastSpokenLineText(currentStepSpokenInstruction);
      ocureVoiceService.speak(
        `${activeRoutine.id}_step_${currentStepIdx + 1}_${currentExercise.instructionId}`,
        currentStepSpokenInstruction,
        {
          interrupt: true,
          forceCancelNow: true,
          recordAsRepeatable: true,
          context: 'instruction',
        }
      );
    }
  };

  // Speak fresh real-time blink rate and screen distance directly from telemetryRef.current
  const handleSpeakLiveStatus = useCallback(() => {
    if (!voiceAvailable) return;
    if (!voiceEnabled) {
      setVoiceEnabled(true);
      ocureVoiceService.setEnabled(true);
    }
    const freshTel = telemetryRef.current;
    const freshIsMonitoring = isMonitoringRef.current;
    const spokenUpdate = buildCombinedLiveStatusVoiceUpdate({
      isMonitoring: freshIsMonitoring,
      faceDetected: freshTel.faceDetected,
      avgBlinkRate: freshTel.avgBlinkRate,
      observationSeconds: freshTel.observationSeconds,
      isCalibrated: freshTel.isCalibrated,
      avgScreenDistance: freshTel.avgScreenDistance ?? freshTel.screenDistanceCm ?? null,
    });
    setLastSpokenLineText(spokenUpdate);
    ocureVoiceService.speak(`ocure_live_status_${Date.now()}`, spokenUpdate, {
      interrupt: true,
      forceCancelNow: true,
      recordAsRepeatable: false,
      context: 'telemetry',
    });
  }, [voiceAvailable, voiceEnabled]);

  // Keyboard controls: Space = Pause/Resume/Start (if under daily limit), Escape = Stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (sessionState === 'step_running' || sessionState === 'awaiting_user') handlePause();
        else if (sessionState === 'paused') handleResume();
        else if (sessionState === 'ready' && !isDailyLimitReached) handleStart();
      } else if (e.code === 'Escape') {
        if (
          sessionState === 'intro' ||
          sessionState === 'countdown' ||
          sessionState === 'step_running' ||
          sessionState === 'awaiting_user' ||
          sessionState === 'paused'
        ) {
          e.preventDefault();
          handleStop();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessionState, isDailyLimitReached, handlePause, handleResume, handleStart, handleStop]);

  // Remaining seconds (clean integer minutes and seconds)
  const totalRemainingSec = Math.max(
    0,
    Math.ceil(120 - (currentStepIdx * 30 + stepElapsedSeconds))
  );
  const formatTime = (sec: number) => {
    const cleanSec = Math.max(0, Math.round(sec));
    const m = Math.floor(cleanSec / 60);
    const s = cleanSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Active cue text: every spoken line also appears as text on screen (Criteria 14, 17, 18)
  const activeCue =
    sessionState === 'intro' || sessionState === 'countdown'
      ? OCURE_SESSION_VOICE_SCRIPTS.countdown_start.caption
      : sessionState === 'step_running' ||
        sessionState === 'awaiting_user' ||
        sessionState === 'paused'
      ? currentGuidedCue.caption
      : currentExercise.caption;

  // Real recommendation label
  const recommendationLabel = isDailyLimitReached
    ? 'Daily limit reached — 5 of 5 breaks completed.'
    : !classification.reliable
    ? 'General break · Insufficient observation data to personalize'
    : classification.band === '0_10'
    ? 'Suggested break · Low blink rate session'
    : 'Recommended 2-minute daily break';

  // Single live camera check status line (OCURE_CAMERA_CHECK.md §5: show one status in one place)
  const getCameraCheckStatusLabel = (): CameraCheckStatusLine => {
    if (!cameraCheckEnabled) {
      return 'Camera check: off';
    }
    if (
      (sessionState === 'awaiting_user' || sessionState === 'step_running') &&
      verificationSnapshot.isAwaitingUser
    ) {
      return verificationSnapshot.awaitingReason === 'face_lost'
        ? FACE_LOST_PAUSED_MESSAGE
        : ACTIVITY_PAUSED_MESSAGE;
    }
    if (
      cameraStatus === 'error' ||
      cameraError ||
      !isMonitoringActive ||
      (cameraStatus !== 'active' && cameraStatus !== 'running')
    ) {
      return 'Camera check: camera unavailable';
    }
    if (sessionState === 'step_running' && verificationSnapshot.statusCaption) {
      return verificationSnapshot.statusCaption;
    }
    return isExerciseVerifiable(currentStep.exerciseId)
      ? 'Camera check: watching'
      : 'Camera check: presence only';
  };
  const cameraCheckStatusLabel = getCameraCheckStatusLabel();

  const isSessionPaused =
    sessionState === 'paused' ||
    sessionState === 'awaiting_user' ||
    (sessionState === 'step_running' && verificationSnapshot.isAwaitingUser);

  return (
    <div className="w-full h-full flex flex-col justify-between font-dm min-w-0 box-border overflow-hidden lg:overflow-hidden min-h-0 select-none">
      {/* Top Header Row (Compact, Single-Line Responsive Header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 pb-2 border-b-2 border-black/15 shrink-0">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-cormorant text-2xl sm:text-3xl font-bold tracking-tight">
              OCURE Coach
            </h1>
          </div>
          <p className="text-xs opacity-85 mt-0.5">
            {isDailyLimitReached ? (
              <span className="font-semibold">
                Today: {dailyPlan.offeredRoutineIds.length} of {dailyPlan.quota} breaks offered,{' '}
                {completedBreaksToday} of {dailyPlan.quota} completed (daily limit reached).
              </span>
            ) : (
              <span>
                Today: <strong>{dailyPlan.offeredRoutineIds.length}</strong> of{' '}
                <strong>{dailyPlan.quota}</strong> breaks offered,{' '}
                <strong>{completedBreaksToday}</strong> of <strong>{dailyPlan.quota}</strong>{' '}
                completed.
              </span>
            )}
          </p>
        </div>

        {/* Header Right: Voice Toggle, Live Status & Precautions */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Coach Voice Switch Toggle */}
          {voiceAvailable ? (
            <button
              type="button"
              onClick={toggleVoice}
              aria-label={voiceEnabled ? 'Turn coach voice off' : 'Turn coach voice on'}
              aria-pressed={voiceEnabled}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                voiceEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                  : 'bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 opacity-70 hover:opacity-100'
              }`}
              title={voiceEnabled ? 'Coach voice is on' : 'Coach voice is off'}
            >
              {voiceEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span className="text-[11px] font-semibold">
                {voiceEnabled ? 'Voice On' : 'Voice Off'}
              </span>
              {voiceEnabled && isCoachSpeaking && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                  title="Speaking"
                />
              )}
            </button>
          ) : (
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 opacity-60"
              title="Browser speech synthesis is unavailable"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>Voice Unavailable</span>
            </span>
          )}

          {/* Live Status Voice Check-in Button */}
          {voiceAvailable && (
            <button
              type="button"
              onClick={handleSpeakLiveStatus}
              aria-label="Speak live blink rate and screen distance"
              title="Hear your current live blink rate and screen distance"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10 opacity-85 hover:opacity-100 transition-all cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">Live Status</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPrecautions(!showPrecautions)}
            className="btn-pill-secondary py-1 px-2.5 text-xs flex items-center gap-1"
            title="Read exercise precautions"
          >
            <Shield className="w-3 h-3" />
            <span>Precautions</span>
          </button>
        </div>
      </div>

      {/* Precautions Expandable Banner */}
      {showPrecautions && (
        <div className="p-3 rounded-2xl tactile-card-orange text-xs flex flex-col gap-1.5 shrink-0 my-1">
          <div className="flex items-center justify-between font-bold uppercase tracking-wider text-[10px]">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              <span>Exercise Safety &amp; Precautions</span>
            </span>
            <div className="flex items-center gap-3">
              {voiceAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    if (!voiceEnabled) {
                      setVoiceEnabled(true);
                      ocureVoiceService.setEnabled(true);
                    }
                    setLastSpokenLineText(
                      OCURE_SESSION_VOICE_SCRIPTS.precautions_summary.spokenText
                    );
                    ocureVoiceService.speak(
                      OCURE_SESSION_VOICE_SCRIPTS.precautions_summary.id,
                      OCURE_SESSION_VOICE_SCRIPTS.precautions_summary.spokenText,
                      {
                        interrupt: true,
                        forceCancelNow: true,
                        recordAsRepeatable: false,
                        context: OCURE_SESSION_VOICE_SCRIPTS.precautions_summary.context,
                      }
                    );
                  }}
                  className="underline cursor-pointer opacity-80 hover:opacity-100 flex items-center gap-1"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Read aloud</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPrecautions(false)}
                className="underline cursor-pointer opacity-80 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          </div>
          <p className="leading-relaxed opacity-90 text-[11px]">{GLOBAL_PRECAUTIONS}</p>
        </div>
      )}

      {/* Classification Band & Escalation Note (if 40+) */}
      {classification.escalationNote && (
        <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-xs flex items-start gap-2.5 text-amber-950 dark:text-amber-200 shrink-0 my-1">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">{classification.escalationNote}</p>
        </div>
      )}

      {/* ============================================================== */}
      {/* MAIN TWO-COLUMN VIEWPORT LAYOUT (No Page Scroll) */}
      {/* Left ~58%: Mascot Media Stage | Right ~42%: Session Panel */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-stretch flex-1 min-h-0 pt-2 pb-1">
        {/* ==================== LEFT COLUMN: STAGE ==================== */}
        <div className="lg:col-span-7 flex flex-col justify-between min-h-0 h-full">
          <div className="tactile-card-white p-3 rounded-[28px] overflow-hidden flex flex-col justify-between h-full min-h-0 gap-2">
            {/* Stage Viewport (16:9 fixed aspect ratio fitting available height) */}
            <div className="relative w-full flex-1 min-h-0 rounded-2xl overflow-hidden bg-neutral-900 border-2 border-black/20 flex items-center justify-center max-h-[calc(100dvh-220px)] aspect-video mx-auto">
              {/* Native Video Element */}
              <video
                ref={videoRef}
                poster={MASCOT_STILL_FALLBACK}
                onError={() => {
                  if (videoRef.current?.error) {
                    setVideoError(true);
                  }
                }}
                onLoadedData={() => {
                  setVideoError(false);
                }}
                className={`w-full h-full object-cover transition-opacity duration-200 ${
                  videoError ? 'hidden' : 'block'
                }`}
                muted
                playsInline
                loop={currentClipManifest.loop}
              />

              {/* Fallback Mascot Still (2752x1536 scaled to stage height, centered, aspect ratio preserved) */}
              {videoError && (
                <div className="relative w-full h-full flex items-center justify-center bg-neutral-900 text-white overflow-hidden">
                  <img
                    src={MASCOT_STILL_FALLBACK}
                    alt="OCURE Mascot"
                    draggable={false}
                    className="w-full h-full object-contain object-center select-none"
                  />
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/65 text-white text-xs opacity-85 backdrop-blur-sm whitespace-nowrap">
                    Demonstration video unavailable
                  </span>
                </div>
              )}

              {/* Countdown Overlay (3, 2, 1) */}
              {sessionState === 'countdown' && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                  <span className="text-7xl sm:text-8xl font-cormorant font-bold text-white tabular-nums select-none animate-none">
                    {countdownNum}
                  </span>
                </div>
              )}

              {/* Manual Pause Overlay */}
              {sessionState === 'paused' && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center z-20 text-white gap-2">
                  <Pause className="w-10 h-10" />
                  <span className="font-dm text-sm font-bold uppercase tracking-wider">
                    Paused
                  </span>
                  <span className="text-xs opacity-80">Press Space to resume</span>
                </div>
              )}

              {/* Camera Check Awaiting User Overlay */}
              {(sessionState === 'awaiting_user' ||
                (sessionState === 'step_running' && verificationSnapshot.isAwaitingUser)) && (
                <div
                  role="status"
                  aria-live="polite"
                  className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center z-20 text-white gap-2.5 px-4 text-center"
                >
                  <Pause className="w-9 h-9 text-amber-300" />
                  <span className="font-dm text-sm font-bold tracking-wide text-amber-200">
                    {cameraCheckStatusLabel}
                  </span>
                  <span className="text-xs opacity-90 max-w-sm">
                    {verificationSnapshot.awaitingReason === 'face_lost'
                      ? OCURE_SESSION_VOICE_SCRIPTS.camera_pause_presence.caption
                      : OCURE_SESSION_VOICE_SCRIPTS.camera_pause_signal.caption}
                  </span>
                  <button
                    type="button"
                    onClick={handleContinueAnyway}
                    className="mt-1 px-4 py-1.5 rounded-full bg-amber-400 text-black font-bold text-xs cursor-pointer hover:bg-amber-300 transition-colors"
                  >
                    Continue anyway
                  </button>
                </div>
              )}

              {/* Badges Overlay on Stage */}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 flex-wrap">
                <span className="glass-badge text-[10px] bg-black/60 text-white border-white/20 capitalize backdrop-blur-md">
                  {currentExercise.shot.replace('_', ' ')}
                </span>
                {(sessionState === 'step_running' || sessionState === 'awaiting_user') &&
                  isOpenCloseEyeExercise(currentStep.exerciseId) && (
                    <span className="glass-badge text-[10px] bg-black/75 text-emerald-300 border-emerald-400/30 backdrop-blur-md">
                      {currentGuidedCue.eyeActionState === 'open'
                        ? 'Step: Open Eyes'
                        : 'Step: Close Eyes'}
                      {' · '}
                      {currentGuidedCue.completedReps ?? 0} reps
                    </span>
                  )}
              </div>

              <div className="absolute top-2.5 right-2.5 z-10">
                <span className="glass-badge text-[10px] bg-black/60 text-white border-white/20 tabular-nums backdrop-blur-md">
                  {sessionState === 'step_running' ||
                  sessionState === 'awaiting_user' ||
                  sessionState === 'paused'
                    ? `Step ${currentStepIdx + 1} of 4`
                    : '120s Routine'}
                </span>
              </div>
            </div>

            {/* Stage Anchored Caption Bar */}
            <div
              aria-live="polite"
              className="p-3 rounded-2xl tactile-inner flex flex-col gap-1 shrink-0"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full inline-block ${
                      isSessionPaused ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  <span>
                    {sessionState === 'completed'
                      ? COMPLETION_CAPTION
                      : sessionState === 'stopped_early'
                      ? 'Stopped Early'
                      : sessionState === 'intro' || sessionState === 'countdown'
                      ? 'Starting Break'
                      : sessionState === 'ready'
                      ? isDailyLimitReached
                        ? 'Daily Limit Reached (5 of 5)'
                        : 'Ready to Start'
                      : isSessionPaused
                      ? sessionState === 'paused'
                        ? 'Paused'
                        : cameraCheckStatusLabel
                      : currentExercise.name}
                  </span>
                </span>
                <span className="font-bold tabular-nums text-xs">
                  {sessionState === 'completed'
                    ? '0:00'
                    : sessionState === 'step_running' ||
                      sessionState === 'awaiting_user' ||
                      sessionState === 'paused'
                    ? formatTime(totalRemainingSec)
                    : formatTime(activeRoutine.totalDurationSeconds)}
                </span>
              </div>

              <p className="text-xs sm:text-sm font-medium leading-relaxed opacity-95 line-clamp-2">
                {sessionState === 'stopped_early' && stoppedEarlyReason
                  ? stoppedEarlyReason
                  : isCoachSpeaking && lastSpokenLineText
                  ? lastSpokenLineText
                  : sessionState === 'completed'
                  ? OCURE_SESSION_VOICE_SCRIPTS.routine_complete.caption
                  : sessionState === 'ready'
                  ? isDailyLimitReached
                    ? "You've completed all 5 breaks for today. Your next break will be available tomorrow."
                    : 'Click "Start 2-Minute Break" below to begin guided movements with the OCURE coach.'
                  : activeCue}
              </p>
            </div>
          </div>
        </div>

        {/* ==================== RIGHT COLUMN: SESSION PANEL ==================== */}
        <div className="lg:col-span-5 flex flex-col justify-between min-h-0 h-full">
          <div className="tactile-card-white p-4 sm:p-5 rounded-[24px] flex flex-col justify-between h-full min-h-0 gap-3">
            {/* Top Section: Single Recommended Routine & "Choose another routine" Popover */}
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-start justify-between gap-2.5 min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300 min-w-0 flex-1 leading-normal">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${
                      isDailyLimitReached ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="break-words font-medium">{recommendationLabel}</span>
                </div>

                {/* Popover trigger button */}
                <div className="relative shrink-0" ref={popoverRef}>
                  <button
                    type="button"
                    onClick={() => setIsRoutinePopoverOpen(!isRoutinePopoverOpen)}
                    disabled={sessionState !== 'ready' || isDailyLimitReached}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1 whitespace-nowrap transition-all ${
                      sessionState !== 'ready' || isDailyLimitReached
                        ? 'opacity-40 cursor-not-allowed border-transparent'
                        : isMinimal
                        ? 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 cursor-pointer'
                        : 'border-black/20 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer'
                    }`}
                    title="Choose a different 2-minute routine"
                  >
                    <span>Choose another</span>
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>

                  {/* Popover Dropdown (Lists all 6 routines compactly) */}
                  {isRoutinePopoverOpen && (
                    <div className="absolute right-0 top-8 w-72 p-2 rounded-2xl bg-white dark:bg-[#1E1E1E] border-2 border-black/20 dark:border-white/20 shadow-xl z-30 flex flex-col gap-1">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider opacity-60">
                        Available 2-Minute Routines
                      </div>
                      {ROUTINE_ORDER.map((rId) => {
                        const r = ROUTINES[rId];
                        const isSel = r.id === activeRoutine.id;
                        const isDone = dailyPlan.completedRoutineIds.includes(r.id);
                        const isRec = suggestedRoutine?.id === r.id;

                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setSelectedRoutineId(r.id);
                              setIsRoutinePopoverOpen(false);
                            }}
                            className={`p-2 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                              isSel
                                ? 'bg-black/10 dark:bg-white/15 font-bold'
                                : 'hover:bg-black/5 dark:hover:bg-white/5 font-medium'
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="text-xs">
                                {r.id} · {r.name}
                              </span>
                              <span className="text-[10px] opacity-70">
                                {isDone ? '✓ Completed today' : isRec ? 'Recommended today' : '2 minutes'}
                              </span>
                            </div>
                            {isSel && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Routine Title */}
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-dm text-xs uppercase font-bold tracking-wider opacity-75">
                    {activeRoutine.id} · 2:00
                  </span>
                  {dailyPlan.completedRoutineIds.includes(activeRoutine.id) && (
                    <span className="glass-badge text-[9px] text-emerald-700 dark:text-emerald-300">
                      ✓ Done Today
                    </span>
                  )}
                </div>
                <h2 className="font-cormorant text-2xl font-bold tracking-tight">
                  {activeRoutine.name}
                </h2>
                <p className="text-xs opacity-80 line-clamp-2 mt-0.5">
                  {activeRoutine.description}
                </p>
              </div>
            </div>

            {/* Middle Section: Progress Bar and Current Step */}
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-[11px] uppercase tracking-wider opacity-75">
                  {sessionState === 'completed'
                    ? '4 of 4 Steps Finished'
                    : isSessionPaused
                    ? sessionState === 'paused'
                      ? `Step ${currentStepIdx + 1} of 4 · Paused`
                      : `Step ${currentStepIdx + 1} of 4 · ${cameraCheckStatusLabel}`
                    : `Step ${currentStepIdx + 1} of 4: ${currentExercise.name}`}
                </span>
                <span className="tabular-nums">
                  {sessionState === 'completed'
                    ? '0:00'
                    : sessionState === 'step_running' ||
                      sessionState === 'awaiting_user' ||
                      sessionState === 'paused'
                    ? formatTime(totalRemainingSec)
                    : formatTime(activeRoutine.totalDurationSeconds)}
                </span>
              </div>

              {/* 4-Segment Progress Bar (visibly stops while paused) */}
              <div className="grid grid-cols-4 gap-1.5 h-2 w-full">
                {activeRoutine.steps.map((_, idx) => {
                  let fillPercent = 0;
                  if (idx < currentStepIdx || sessionState === 'completed') {
                    fillPercent = 100;
                  } else if (
                    idx === currentStepIdx &&
                    (sessionState === 'step_running' ||
                      sessionState === 'awaiting_user' ||
                      sessionState === 'paused')
                  ) {
                    fillPercent = Math.min(100, Math.max(0, (stepElapsedSeconds / 30) * 100));
                  }

                  return (
                    <div
                      key={idx}
                      className={
                        isMinimal
                          ? isDark
                            ? 'h-full rounded-full bg-white/10 overflow-hidden'
                            : 'h-full rounded-full bg-slate-900/10 overflow-hidden'
                          : isDark
                          ? 'h-full rounded-full bg-[#161616] border border-[#F5F5F0]/30 overflow-hidden'
                          : 'h-full rounded-full bg-black/10 border border-black/20 overflow-hidden'
                      }
                    >
                      <div
                        className={`h-full rounded-full ${
                          isSessionPaused && idx === currentStepIdx
                            ? 'bg-amber-500'
                            : isMinimal
                            ? isDark
                              ? 'bg-[var(--theme-accent,#FF7A1A)]'
                              : 'bg-[#5B3CB5]'
                            : isDark
                            ? 'bg-[#D4FF3F]'
                            : 'bg-[#FF851B]'
                        }`}
                        style={{
                          width: `${fillPercent}%`,
                          transition: isSessionPaused ? 'none' : 'width 60ms linear',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Current Step Instruction Card */}
              <div className="tactile-inner p-3 rounded-2xl flex flex-col gap-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                    {(sessionState === 'step_running' || sessionState === 'awaiting_user') &&
                    isOpenCloseEyeExercise(currentStep.exerciseId)
                      ? `Step ${currentStepIdx + 1} · ${currentGuidedCue.completedReps ?? 0} reps`
                      : `Step ${currentStepIdx + 1} Instructions`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {(sessionState === 'step_running' || sessionState === 'awaiting_user') &&
                      isOpenCloseEyeExercise(currentStep.exerciseId) && (
                        <span className="glass-badge text-[9px]">
                          Target: {currentGuidedCue.eyeActionState === 'open' ? 'OPEN' : 'CLOSED'}
                        </span>
                      )}
                    {voiceAvailable && (
                      <button
                        type="button"
                        onClick={handleRepeatInstruction}
                        aria-label="Repeat spoken instruction"
                        title="Repeat current step instruction aloud"
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-black/15 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>Repeat</span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs leading-relaxed font-medium">
                  {sessionState === 'step_running' ||
                  sessionState === 'awaiting_user' ||
                  sessionState === 'paused'
                    ? currentGuidedCue.caption
                    : currentExercise.caption}
                </p>
                {currentStep.customPacingNote && (
                  <span className="text-[10px] italic opacity-85">
                    Pacing: {currentStep.customPacingNote}
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Section: Camera Check Switch & Single Status Line next to Voice Status + Primary Actions */}
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between text-[11px] opacity-90 px-1 gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={cameraCheckEnabled}
                    aria-label={
                      cameraCheckEnabled ? 'Turn camera check off' : 'Turn camera check on'
                    }
                    onClick={handleToggleCameraCheck}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer shrink-0 ${
                      cameraCheckEnabled
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                        : 'bg-black/5 dark:bg-white/10 border-black/15 dark:border-white/15 opacity-75 hover:opacity-100'
                    }`}
                  >
                    {cameraCheckEnabled ? (
                      <Camera className="w-3 h-3 text-emerald-600 dark:text-emerald-300" />
                    ) : (
                      <CameraOff className="w-3 h-3" />
                    )}
                    <span>{cameraCheckEnabled ? 'On' : 'Off'}</span>
                  </button>
                  <span
                    data-testid="ocure-camera-check-status"
                    className={
                      (sessionState === 'awaiting_user' || sessionState === 'step_running') &&
                      verificationSnapshot.isAwaitingUser
                        ? 'font-semibold text-amber-700 dark:text-amber-300 truncate'
                        : 'truncate'
                    }
                  >
                    {cameraCheckStatusLabel}
                  </span>
                </div>
                <span className="shrink-0">
                  {!voiceAvailable
                    ? 'Voice: unavailable'
                    : !voiceEnabled
                    ? 'Voice: off'
                    : isCoachSpeaking
                    ? 'Voice: speaking'
                    : 'Voice: on'}
                </span>
              </div>

              {/* Action Buttons (52px high pill) */}
              {sessionState === 'ready' && (
                <div className="flex flex-col gap-1.5">
                  {isDailyLimitReached && (
                    <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-center">
                      You&apos;ve completed all 5 breaks for today. Your next break will be available tomorrow.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={isDailyLimitReached}
                    className={
                      isDailyLimitReached
                        ? 'w-full h-[52px] rounded-full bg-neutral-300 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-not-allowed opacity-70'
                        : isMinimal
                        ? isDark
                          ? 'w-full h-[52px] rounded-full bg-[var(--theme-accent,#FF7A1A)] text-[#0D0D0D] font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md hover:brightness-105 active:scale-[0.99]'
                          : 'w-full h-[52px] rounded-full bg-[#111827] text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md hover:bg-black active:scale-[0.99]'
                        : isDark
                        ? 'w-full h-[52px] rounded-full bg-[#D4FF3F] text-[#0D0D0D] font-extrabold text-sm tracking-wide flex items-center justify-center gap-2 border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] transition-all cursor-pointer hover:bg-[#FF8A1F] active:translate-y-0.5'
                        : 'w-full h-[52px] rounded-full bg-[#FF851B] text-black font-extrabold text-sm tracking-wide flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] transition-all cursor-pointer hover:bg-[#FFD84D] active:translate-y-0.5'
                    }
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {isDailyLimitReached
                        ? 'Daily Limit Reached (5 of 5)'
                        : 'Start 2-Minute Break'}
                    </span>
                  </button>
                </div>
              )}

              {(sessionState === 'intro' || sessionState === 'countdown') && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleStop}
                    className="btn-pill-secondary w-full py-2.5 text-xs flex items-center justify-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop (Esc)</span>
                  </button>
                </div>
              )}

              {sessionState === 'step_running' && !verificationSnapshot.isAwaitingUser && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handlePause}
                    className={
                      isMinimal
                        ? isDark
                          ? 'w-full h-[52px] rounded-full bg-white/[0.12] hover:bg-white/[0.18] text-[#F5EDE4] font-bold text-sm flex items-center justify-center gap-2 border border-white/20 transition-all cursor-pointer'
                          : 'w-full h-[52px] rounded-full bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer'
                        : isDark
                        ? 'w-full h-[52px] rounded-full bg-[#262626] text-[#F5F5F0] font-extrabold text-sm flex items-center justify-center gap-2 border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] transition-all cursor-pointer'
                        : 'w-full h-[52px] rounded-full bg-[#FFD84D] text-black font-extrabold text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] transition-all cursor-pointer'
                    }
                  >
                    <Pause className="w-4 h-4" />
                    <span>Pause (Space)</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {currentStep.skippable && (
                      <button
                        type="button"
                        onClick={handleSkipStep}
                        className="btn-pill-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
                      >
                        <span>Skip Step</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleStop}
                      className="btn-pill-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop (Esc)</span>
                    </button>
                  </div>
                </div>
              )}

              {(sessionState === 'awaiting_user' ||
                (sessionState === 'step_running' && verificationSnapshot.isAwaitingUser)) && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleContinueAnyway}
                    className={
                      isMinimal
                        ? isDark
                          ? 'w-full h-[52px] rounded-full bg-[var(--theme-accent,#FF7A1A)] text-[#0D0D0D] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md'
                          : 'w-full h-[52px] rounded-full bg-[#111827] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md'
                        : isDark
                        ? 'w-full h-[52px] rounded-full bg-[#D4FF3F] text-[#0D0D0D] font-extrabold text-sm flex items-center justify-center gap-2 border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] cursor-pointer'
                        : 'w-full h-[52px] rounded-full bg-[#25D6C1] text-black font-extrabold text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] cursor-pointer'
                    }
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Continue anyway</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePause}
                      className="btn-pill-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStop}
                      className="btn-pill-secondary flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop (Esc)</span>
                    </button>
                  </div>
                </div>
              )}

              {sessionState === 'paused' && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleResume}
                    className={
                      isMinimal
                        ? isDark
                          ? 'w-full h-[52px] rounded-full bg-[var(--theme-accent,#FF7A1A)] text-[#0D0D0D] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md'
                          : 'w-full h-[52px] rounded-full bg-[#111827] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md'
                        : isDark
                        ? 'w-full h-[52px] rounded-full bg-[#D4FF3F] text-[#0D0D0D] font-extrabold text-sm flex items-center justify-center gap-2 border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] cursor-pointer'
                        : 'w-full h-[52px] rounded-full bg-[#25D6C1] text-black font-extrabold text-sm flex items-center justify-center gap-2 border-2 border-black shadow-[3px_3px_0px_#000000] cursor-pointer'
                    }
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Resume (Space)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStop}
                    className="btn-pill-secondary w-full py-2 text-xs flex items-center justify-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Routine</span>
                  </button>
                </div>
              )}

              {(sessionState === 'completed' || sessionState === 'stopped_early') && (
                <div className="flex flex-col gap-2">
                  <div className="p-3 rounded-2xl tactile-inner flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>
                        {sessionState === 'completed' ? 'Routine Finished' : 'Stopped Early'}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      Elapsed:{' '}
                      {formatTime(
                        sessionState === 'completed'
                          ? 120
                          : currentStepIdx * 30 + stepElapsedSeconds
                      )}
                    </span>
                  </div>

                  {/* Summary of 4 steps with real cameraCheck status, checkPauseCount, and reminderCount */}
                  <div className="p-2.5 rounded-xl tactile-inner flex flex-col gap-1 text-[11px]">
                    {activeRoutine.steps.map((st, i) => {
                      const ex = EXERCISES[st.exerciseId];
                      const outcome =
                        stepOutcomes[i] ||
                        (sessionState === 'completed' || i < currentStepIdx
                          ? 'finished'
                          : 'skipped');
                      const recordedCheck: CameraCheckStatus =
                        stepCameraChecks[i] ||
                        (cameraCheckEnabled
                          ? isExerciseVerifiable(st.exerciseId)
                            ? 'presence_only'
                            : 'presence_only'
                          : 'check_off');
                      const pauses = stepCheckPauseCounts[i] || 0;
                      const reminders = stepReminderCounts[i] || 0;
                      let checkLabel = 'Camera check: presence only';
                      if (recordedCheck === 'check_off') {
                        checkLabel = 'Camera check: off';
                      } else if (recordedCheck === 'camera_unavailable') {
                        checkLabel = 'Camera check: camera unavailable';
                      } else if (recordedCheck === 'continued_anyway') {
                        checkLabel = `Continued anyway (${pauses}p, ${reminders}r)`;
                      } else if (recordedCheck === 'detected') {
                        checkLabel =
                          pauses > 0 || reminders > 0
                            ? `Camera check: watching (${pauses}p, ${reminders}r)`
                            : 'Camera check: watching';
                      } else {
                        checkLabel =
                          pauses > 0 || reminders > 0
                            ? `Camera check: presence only (${pauses}p, ${reminders}r)`
                            : 'Camera check: presence only';
                      }

                      return (
                        <div key={i} className="flex items-center justify-between opacity-85">
                          <span>
                            Step {i + 1}: {ex.name} ({outcome})
                          </span>
                          <span className="text-[10px] opacity-75">{checkLabel}</span>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleResetToReady}
                    className="btn-pill-primary w-full py-2.5 text-xs flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {isDailyLimitReached
                        ? 'Done · Daily Limit Reached (5 of 5)'
                        : 'Done · Choose Another Break'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
