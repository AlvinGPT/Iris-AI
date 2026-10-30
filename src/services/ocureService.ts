/**
 * OCURE SERVICE & PURE ENGINES (Revision 5)
 * Deterministic band classification, daily plan management, routine selection,
 * Revision 5 camera check state machine (OCURE_CAMERA_CHECK.md), and session state definitions.
 *
 * NOTE: All numeric timing thresholds below are unvalidated product defaults
 * (not clinical doses, not a medical treatment, and not a diagnosis).
 */

import {
  ROUTINES,
  ROUTINE_ORDER,
  EXERCISES,
  RoutineRecord,
  OCURE_SESSION_VOICE_SCRIPTS,
  buildCameraSignalReminderText,
  OcureVoiceDeliveryContext,
} from '../data/ocureExercises';
export type { RoutineRecord };

export const OCURE_CONFIG = {
  MIN_RELIABLE_OBSERVATION_MINUTES: 5, // Minimum minutes of valid webcam observation before band assignment
  MIN_ACTIVE_MINUTES_BETWEEN_OFFERS: 60, // Monitored active minutes since last break before next offer
  SNOOZE_MINUTES: 10, // Snooze duration when user clicks 'Later' on the break offer card
  MAX_DAILY_BREAKS: 5, // Hard daily limit of completed breaks per local calendar day
  DEFAULT_DAILY_QUOTA: 5, // Default daily break allowance
  MIN_QUOTA: 3, // Minimum configurable daily quota (3-5 offers/day per OCURE_DAILY_PLAN.md)
  MAX_QUOTA: 5, // Maximum configurable daily quota
  OFFER_EXPIRY_SECONDS: 120, // Dismiss offer after 2 minutes if unacted upon
  RETENTION_DAYS: 30,
  INTRO_MAX_WAIT_SECONDS: 6, // Max wait for intro speech before countdown begins (default 6, OCURE_VOICE.md §1)
  NUDGE_AT_SECONDS: 15, // Mid-step spoken nudge timestamp (default 15, OCURE_VOICE.md §4)
};

export const OCURE_CAMERA_CHECK_CONFIG = {
  FACE_LOST_PAUSE_SECONDS: 3, // Continuous reliable face-not-detected duration before awaiting_user (default 3)
  FACE_RETURN_RESUME_SECONDS: 1, // Face present duration before silent auto-resume (default 1)
  STEP_GRACE_SECONDS: 5, // Initial active step time before signal checks begin (default 5)
  COMPLIANCE_WINDOW_SECONDS: 10, // Active step time per stage before reminder (stage 1) then pause (stage 2) (default 10)
  CLOSURE_MIN_SECONDS: 2, // Minimum eye closure duration per window for eye_closure (default 2)
  HEAD_TURN_MIN_DEGREES: 10, // Minimum head yaw change in degrees for head_turn (default 10)
  MAX_PAUSES_PER_STEP: 2, // Maximum check-pauses per step before check turns off for that step (default 2)
  MIN_SECONDS_BETWEEN_SPOKEN_LINES: 8, // Minimum spacing between spoken camera lines (default 8)
  AWAITING_USER_TIMEOUT_SECONDS: 60, // Max awaiting_user duration before ending session as stopped_early (default 60)

  // Internal frame & cycle helpers
  MAX_FRAME_STALE_MS: 1500,
  BLINK_CLOSED_MIN_MS: 120,
  EYE_CLOSURE_HOLD_MIN_MS: 450,
  OPEN_CONFIRM_MIN_MS: 200,
  REMINDER_COOLDOWN_MS: 8000,
  FACE_LOST_REMINDER_SECONDS: 3,
  MAX_PROMPTS_PER_STEP: 2,
};

/**
 * Allowed status line strings in OCURE_CAMERA_CHECK.md §5.
 */
export type CameraCheckStatusLine =
  | 'Camera check: watching'
  | 'Camera check: presence only'
  | 'Camera check: off'
  | 'Camera check: camera unavailable'
  | "Paused: we can't see you"
  | 'Paused: waiting for the step';

export const ACTIVITY_PAUSED_MESSAGE: CameraCheckStatusLine = 'Paused: waiting for the step';
export const FACE_LOST_PAUSED_MESSAGE: CameraCheckStatusLine = "Paused: we can't see you";

/**
 * Saved per-step cameraCheck status in ExerciseSessionRecord (OCURE_CAMERA_CHECK.md §6).
 */
export type CameraCheckStatus =
  | 'detected'
  | 'presence_only'
  | 'camera_unavailable'
  | 'continued_anyway'
  | 'check_off';

export const OCURE_CAMERA_CHECK_PREF_KEY = 'iris_ocure_camera_check_v1';

/**
 * Returns whether Camera Check is enabled (default: true).
 */
export function getStoredCameraCheckPref(): boolean {
  try {
    const val = localStorage.getItem(OCURE_CAMERA_CHECK_PREF_KEY);
    if (val !== null) {
      return val === 'true';
    }
  } catch {
    // ignore
  }
  return true;
}

export function setStoredCameraCheckPref(enabled: boolean): void {
  try {
    localStorage.setItem(OCURE_CAMERA_CHECK_PREF_KEY, String(enabled));
  } catch {
    // ignore
  }
}

export function isOpenCloseEyeExercise(exerciseId: string): boolean {
  return exerciseId === 'blink_complete' || exerciseId === 'eye_closure';
}

export function isGazeExercise(exerciseId: string): boolean {
  return (
    exerciseId === 'eyes_horizontal' ||
    exerciseId === 'eyes_vertical' ||
    exerciseId === 'eyes_diagonal'
  );
}

export function isPresenceOnlyExercise(exerciseId: string): boolean {
  return (
    exerciseId === 'shoulder_release' ||
    exerciseId === 'face_settle' ||
    exerciseId === 'breathing_eyes_open' ||
    exerciseId === 'quiet_rest'
  );
}

/**
 * Returns whether an exercise step has a verifiable movement signal (OCURE_CAMERA_CHECK.md §4):
 * - blink_complete: verifiable (at least one blink event per window)
 * - eye_closure: verifiable (eyes closed at least CLOSURE_MIN_SECONDS = 2s once per window)
 * - head_turn: verifiable if head rotation data exists (head yaw change >= HEAD_TURN_MIN_DEGREES = 10 deg)
 * - eyes_horizontal, eyes_vertical, eyes_diagonal: best effort only if gaze data exists and confidence is good
 * - shoulder_release, face_settle, breathing_eyes_open, quiet_rest: presence only (returns false)
 */
export function isExerciseVerifiable(
  exerciseId: string,
  options?: { hasGazeData?: boolean; hasHeadRotation?: boolean }
): boolean {
  if (isPresenceOnlyExercise(exerciseId)) {
    return false;
  }
  if (exerciseId === 'blink_complete' || exerciseId === 'eye_closure') {
    return true;
  }
  if (exerciseId === 'head_turn') {
    return options?.hasHeadRotation !== false;
  }
  if (isGazeExercise(exerciseId)) {
    return options?.hasGazeData !== false;
  }
  return false;
}

export interface ExerciseDetectionCriteria {
  exerciseId: string;
  verifiable: boolean;
  primarySignals: string[];
  allowedNaturalMovements: string[];
  maxAllowedHeadYawDeg: number;
  maxAllowedHeadPitchDeg: number;
  minGazeHorizontalExcursion?: number;
  minGazeVerticalExcursion?: number;
  minHeadYawDeltaDeg?: number;
  minClosureScore?: number;
}

export const EXERCISE_DETECTION_PROFILES: Record<string, ExerciseDetectionCriteria> = {
  blink_complete: {
    exerciseId: 'blink_complete',
    verifiable: true,
    primarySignals: ['eyeClosureScore', 'combinedAperture', 'blinkState', 'lastBlinkTimestamp'],
    allowedNaturalMovements: ['minor_head_shift', 'posture_adjustment', 'inter_rep_open_pause'],
    maxAllowedHeadYawDeg: 28,
    maxAllowedHeadPitchDeg: 25,
    minClosureScore: 0.38,
  },
  eye_closure: {
    exerciseId: 'eye_closure',
    verifiable: true,
    primarySignals: ['eyeClosureScore', 'combinedAperture', 'blinkState'],
    allowedNaturalMovements: ['gentle_head_sway', 'breathing_shift', 'guided_cue_reopen'],
    maxAllowedHeadYawDeg: 30,
    maxAllowedHeadPitchDeg: 26,
    minClosureScore: 0.32,
  },
  eyes_horizontal: {
    exerciseId: 'eyes_horizontal',
    verifiable: true,
    primarySignals: ['gazeHorizontal', 'leftRightApertureAsymmetry'],
    allowedNaturalMovements: ['natural_blinking', 'minor_head_stabilization', 'posture_adjustment'],
    maxAllowedHeadYawDeg: 24,
    maxAllowedHeadPitchDeg: 22,
    minGazeHorizontalExcursion: 0.06,
  },
  eyes_vertical: {
    exerciseId: 'eyes_vertical',
    verifiable: true,
    primarySignals: ['gazeVertical', 'combinedAperture'],
    allowedNaturalMovements: ['natural_blinking', 'subtle_neck_pitch', 'posture_adjustment'],
    maxAllowedHeadYawDeg: 24,
    maxAllowedHeadPitchDeg: 25,
    minGazeVerticalExcursion: 0.055,
  },
  eyes_diagonal: {
    exerciseId: 'eyes_diagonal',
    verifiable: true,
    primarySignals: ['gazeHorizontal', 'gazeVertical', 'combinedAperture'],
    allowedNaturalMovements: ['natural_blinking', 'minor_head_stabilization', 'posture_adjustment'],
    maxAllowedHeadYawDeg: 25,
    maxAllowedHeadPitchDeg: 24,
    minGazeHorizontalExcursion: 0.05,
    minGazeVerticalExcursion: 0.05,
  },
  head_turn: {
    exerciseId: 'head_turn',
    verifiable: true,
    primarySignals: ['headYaw'],
    allowedNaturalMovements: ['natural_blinking', 'subtle_pitch_roll', 'turn_apex_hold'],
    maxAllowedHeadYawDeg: 55,
    maxAllowedHeadPitchDeg: 26,
    minHeadYawDeltaDeg: OCURE_CAMERA_CHECK_CONFIG.HEAD_TURN_MIN_DEGREES,
  },
  shoulder_release: {
    exerciseId: 'shoulder_release',
    verifiable: false,
    primarySignals: ['presence'],
    allowedNaturalMovements: ['natural_blinking', 'breathing_settle', 'gentle_head_tilt'],
    maxAllowedHeadYawDeg: 35,
    maxAllowedHeadPitchDeg: 30,
  },
  face_settle: {
    exerciseId: 'face_settle',
    verifiable: false,
    primarySignals: ['presence'],
    allowedNaturalMovements: ['soft_blinking', 'partial_or_full_eye_closure', 'breathing_motion'],
    maxAllowedHeadYawDeg: 35,
    maxAllowedHeadPitchDeg: 30,
  },
  breathing_eyes_open: {
    exerciseId: 'breathing_eyes_open',
    verifiable: false,
    primarySignals: ['presence'],
    allowedNaturalMovements: ['inhale_eye_closure', 'exhale_open_gaze', 'natural_blinking'],
    maxAllowedHeadYawDeg: 35,
    maxAllowedHeadPitchDeg: 30,
  },
  quiet_rest: {
    exerciseId: 'quiet_rest',
    verifiable: false,
    primarySignals: ['presence'],
    allowedNaturalMovements: ['soft_unfocused_gaze', 'gentle_eye_closure', 'natural_blinking'],
    maxAllowedHeadYawDeg: 35,
    maxAllowedHeadPitchDeg: 30,
  },
};

export function getExerciseDetectionCriteria(exerciseId: string): ExerciseDetectionCriteria {
  return EXERCISE_DETECTION_PROFILES[exerciseId] || EXERCISE_DETECTION_PROFILES.blink_complete;
}

/**
 * Extracts real-time local exercise motion features (horizontal/vertical gaze, vertical posture,
 * jaw relaxation, brow tension, and partial face occlusion) from MediaPipe landmarks & blendshapes.
 * Runs 100% locally in memory; never stores or transmits frames.
 */
export function extractExerciseMotionFeatures(
  landmarks: Array<{ x: number; y: number; z?: number }> | null | undefined,
  blendshapes?: Record<string, number>,
  headPose?: { yaw: number; pitch: number; roll: number }
): {
  gazeHorizontal: number;
  gazeVertical: number;
  postureY: number;
  jawRelaxScore: number;
  browTensionScore: number;
  faceObscured: boolean;
} {
  if (!landmarks || landmarks.length < 468) {
    return {
      gazeHorizontal: 0,
      gazeVertical: 0,
      postureY: 0.5,
      jawRelaxScore: 0,
      browTensionScore: 0,
      faceObscured: true,
    };
  }

  const nose = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const rightInner = landmarks[362];
  const rightOuter = landmarks[263];
  const leftTop = landmarks[159];
  const leftBottom = landmarks[145];
  const rightTop = landmarks[386];
  const rightBottom = landmarks[374];

  const keyPoints = [nose, forehead, chin, leftOuter, leftInner, rightInner, rightOuter];
  const anyInvalidOrEdge = keyPoints.some(
    (p) =>
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < 0.02 ||
      p.x > 0.98 ||
      p.y < 0.02 ||
      p.y > 0.98
  );
  const faceHeight = forehead && chin ? Math.abs(chin.y - forehead.y) : 0;
  const faceObscured = anyInvalidOrEdge || faceHeight < 0.06;

  // 1. Horizontal gaze [-1..1] from blendshapes + iris center landmarks (468, 473)
  let blendGazeH = 0;
  let hasBlendGazeH = false;
  if (blendshapes) {
    const lookRight =
      ((blendshapes.eyeLookOutRight ?? 0) + (blendshapes.eyeLookInLeft ?? 0)) * 0.5;
    const lookLeft =
      ((blendshapes.eyeLookOutLeft ?? 0) + (blendshapes.eyeLookInRight ?? 0)) * 0.5;
    if (lookRight > 0 || lookLeft > 0) {
      blendGazeH = lookRight - lookLeft;
      hasBlendGazeH = true;
    }
  }

  let irisGazeH = 0;
  let hasIrisGazeH = false;
  if (landmarks.length >= 474 && leftOuter && leftInner && rightInner && rightOuter) {
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    const leftSpan = leftInner.x - leftOuter.x;
    const rightSpan = rightOuter.x - rightInner.x;
    if (
      leftIris &&
      rightIris &&
      Math.abs(leftSpan) > 0.008 &&
      Math.abs(rightSpan) > 0.008
    ) {
      const leftRatio = (leftIris.x - leftOuter.x) / leftSpan - 0.5;
      const rightRatio = (rightIris.x - rightInner.x) / rightSpan - 0.5;
      irisGazeH = Math.max(-1, Math.min(1, (leftRatio + rightRatio) * 1.35));
      hasIrisGazeH = true;
    }
  }

  const gazeHorizontal =
    hasBlendGazeH && hasIrisGazeH
      ? Number((blendGazeH * 0.65 + irisGazeH * 0.35).toFixed(4))
      : hasBlendGazeH
      ? Number(blendGazeH.toFixed(4))
      : Number(irisGazeH.toFixed(4));

  // 2. Vertical gaze [-1..1] from blendshapes + iris/eyelid vertical displacement
  let blendGazeV = 0;
  let hasBlendGazeV = false;
  if (blendshapes) {
    const lookUp =
      ((blendshapes.eyeLookUpLeft ?? 0) + (blendshapes.eyeLookUpRight ?? 0)) * 0.5;
    const lookDown =
      ((blendshapes.eyeLookDownLeft ?? 0) + (blendshapes.eyeLookDownRight ?? 0)) * 0.5;
    if (lookUp > 0 || lookDown > 0) {
      blendGazeV = lookUp - lookDown;
      hasBlendGazeV = true;
    }
  }

  let irisGazeV = 0;
  if (
    landmarks.length >= 474 &&
    leftOuter &&
    leftInner &&
    rightInner &&
    rightOuter &&
    leftTop &&
    leftBottom &&
    rightTop &&
    rightBottom
  ) {
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    const leftCornerMidY = (leftOuter.y + leftInner.y) * 0.5;
    const rightCornerMidY = (rightOuter.y + rightInner.y) * 0.5;
    const avgEyeWidth =
      (Math.abs(leftInner.x - leftOuter.x) + Math.abs(rightOuter.x - rightInner.x)) * 0.5;
    if (leftIris && rightIris && avgEyeWidth > 0.008) {
      const leftOffset = (leftCornerMidY - leftIris.y) / avgEyeWidth;
      const rightOffset = (rightCornerMidY - rightIris.y) / avgEyeWidth;
      irisGazeV = Math.max(-1, Math.min(1, (leftOffset + rightOffset) * 1.4));
    }
  }

  const gazeVertical =
    hasBlendGazeV
      ? Number((blendGazeV * 0.7 + irisGazeV * 0.3).toFixed(4))
      : Number(irisGazeV.toFixed(4));

  // 3. Normalized vertical posture coordinate [0..1] (chin + nose midpoint)
  const postureY =
    nose && chin ? Number(((nose.y + chin.y) * 0.5).toFixed(4)) : 0.5;

  // 4. Jaw relaxation / opening score [0..1]
  let jawRelaxScore = blendshapes?.jawOpen ?? 0;
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  if (jawRelaxScore === 0 && upperLip && lowerLip && faceHeight > 0.05) {
    jawRelaxScore = Math.min(1, Math.max(0, Math.abs(lowerLip.y - upperLip.y) / (faceHeight * 0.25)));
  }

  // 5. Brow tension score [0..1]
  const browTensionScore = blendshapes
    ? Number((((blendshapes.browDownLeft ?? 0) + (blendshapes.browDownRight ?? 0)) * 0.5).toFixed(3))
    : 0;

  void headPose;

  return {
    gazeHorizontal,
    gazeVertical,
    postureY,
    jawRelaxScore: Number(jawRelaxScore.toFixed(3)),
    browTensionScore,
    faceObscured,
  };
}

/**
 * Explicit Exercise Verification State Machine States
 */
export type ExerciseVerificationState =
  | 'READY'
  | 'INSTRUCT_CLOSE'
  | 'WAITING_FOR_EYES_CLOSED'
  | 'INSTRUCT_OPEN'
  | 'WAITING_FOR_EYES_OPEN'
  | 'PERFORMING'
  | 'AWAITING_USER'
  | 'ACTIVITY_PAUSED'
  | 'LOW_CONFIDENCE'
  | 'FACE_OBSCURED'
  | 'COMPLETED'
  | 'PAUSED'
  | 'CAMERA_UNAVAILABLE';

export type AwaitingUserReason = 'face_lost' | 'signal_missing' | null;

export interface EyeVerificationFrameSample {
  timestampMs: number;
  isMonitoring: boolean;
  cameraStatus: string;
  faceDetected: boolean;
  isReliable: boolean;
  trackingQuality?: 'High' | 'Moderate' | 'Low' | 'Lost';
  combinedAperture: number;
  leftEyeAperture?: number;
  rightEyeAperture?: number;
  closureThresholdEAR: number;
  reopenThresholdEAR: number;
  eyeClosureScore: number;
  blinkState: string;
  headYaw?: number;
  headPitch?: number;
  headRoll?: number;
  gazeHorizontal?: number;
  gazeVertical?: number;
  postureY?: number;
  jawRelaxScore?: number;
  browTensionScore?: number;
  faceObscured?: boolean;
  lastBlinkTimestamp?: number | null;
  frameAgeMs?: number;
  cameraCheckEnabled?: boolean;
  isSpeechActive?: boolean;
  /** True while the camera tracker is still warming up and has not produced results yet ("No data yet" is NOT "no face") */
  trackerWarmingUp?: boolean;
}

export interface VerificationSpeechPrompt {
  id: string;
  spokenText: string;
  caption: string;
  context: OcureVoiceDeliveryContext;
  isReminder: boolean;
}

export interface ExerciseVerificationSnapshot {
  state: ExerciseVerificationState;
  exerciseId: string;
  isOpenCloseExercise: boolean;
  verifiedActiveMs: number;
  verifiedActiveSeconds: number;
  requiredActiveSeconds: number;
  completedCycles: number;
  detectedEyeState: 'closed' | 'open' | 'transitioning' | 'untracked';
  isTimerAdvancing: boolean;
  isActivityPaused: boolean;
  isAwaitingUser: boolean;
  awaitingReason: AwaitingUserReason;
  awaitingUserSeconds: number;
  isAwaitingTimeout: boolean;
  isWaitingForAction: boolean;
  isActionTimedOut: boolean;
  cameraUnavailableReason:
    | 'camera_off'
    | 'permission_denied'
    | 'face_lost'
    | 'face_obscured'
    | 'low_confidence'
    | 'stale_data'
    | null;
  statusCaption: CameraCheckStatusLine;
  statusInstruction: string;
  promptToSpeak: VerificationSpeechPrompt | null;
  promptCount: number;
  checkPauseCount: number;
  reminderCount: number;
  continuedAnyway: boolean;
}

/**
 * Evaluates whether a single telemetry frame provides reliable evidence of both eyes closed.
 */
export function isFrameEyesClosed(sample: EyeVerificationFrameSample): boolean {
  if (!sample.faceDetected || !sample.isReliable || sample.trackingQuality === 'Lost') {
    return false;
  }
  const closureThresh = sample.closureThresholdEAR > 0 ? sample.closureThresholdEAR : 0.23;
  const apertureClosed =
    sample.combinedAperture > 0 && sample.combinedAperture <= closureThresh * 1.05;
  const scoreClosed = sample.eyeClosureScore >= 0.42;
  const stateClosed =
    sample.blinkState === 'CLOSED' ||
    sample.blinkState === 'PROLONGED_CLOSURE' ||
    sample.blinkState === 'CLOSING' ||
    sample.blinkState === 'PARTIALLY_CLOSED';

  return scoreClosed || stateClosed || apertureClosed;
}

/**
 * Evaluates whether a single telemetry frame provides reliable evidence of both eyes open.
 */
export function isFrameEyesOpen(sample: EyeVerificationFrameSample): boolean {
  if (!sample.faceDetected || !sample.isReliable || sample.trackingQuality === 'Lost') {
    return false;
  }
  const reopenThresh = sample.reopenThresholdEAR > 0 ? sample.reopenThresholdEAR : 0.25;
  const apertureOpen =
    sample.combinedAperture <= 0 || sample.combinedAperture >= reopenThresh * 0.92;
  const scoreOpen = sample.eyeClosureScore <= 0.30;
  const stateOpen = sample.blinkState === 'OPEN' || sample.blinkState === 'CALIBRATING';

  return stateOpen && scoreOpen && apertureOpen;
}

interface RollingMotionSample {
  timestampMs: number;
  gazeH: number;
  gazeV: number;
  yaw: number;
  pitch: number;
  ear: number;
  closureScore: number;
}

/**
 * Revision 5 Camera Check State Machine (OCURE_CAMERA_CHECK.md):
 * - Presence (every step): face not detected for FACE_LOST_PAUSE_SECONDS (3 s) of continuous
 *   reliable tracking -> enter awaiting_user (reason 'face_lost'): pause session clock & clip,
 *   speak "I can't see you. Please move back into view." Auto-resume after face is present for
 *   FACE_RETURN_RESUME_SECONDS (1 s) with no spoken line on resume.
 * - Step signal (verifiable steps only: blink_complete, eye_closure, head_turn, and gaze steps
 *   when gaze data exists with good confidence), two stages:
 *   1. After STEP_GRACE_SECONDS (5 s) of ACTIVE step time, if expected signal has not appeared
 *      within COMPLIANCE_WINDOW_SECONDS (10 s) with good confidence -> spoken reminder
 *      "Let's keep going." + the step caption. The session keeps running.
 *   2. If signal is still absent after one more COMPLIANCE_WINDOW_SECONDS (10 s) -> enter
 *      awaiting_user (reason 'signal_missing'): pause clock & clip, speak
 *      "Paused. Do the step to continue." Auto-resume as soon as signal appears, or when
 *      the user presses "Continue anyway".
 * - Limits:
 *   - At most MAX_PAUSES_PER_STEP (2) check-pauses per step; after that check is off for the
 *     rest of that step (status 'continued_anyway').
 *   - Spoken lines are at least MIN_SECONDS_BETWEEN_SPOKEN_LINES (8 s) apart and never overlap speech.
 *   - If awaiting_user lasts AWAITING_USER_TIMEOUT_SECONDS (60 s), sets isAwaitingTimeout = true
 *     so the session ends as 'stopped_early' with a neutral message.
 *   - Low confidence, glare, glasses, stale tracker output, tracker warm-up, or camera unavailable
 *     never pause the session (fail-open).
 */
export class OcureExerciseVerificationMachine {
  private state: ExerciseVerificationState = 'READY';
  private exerciseId: string = 'blink_complete';
  private requiredActiveMs: number = 30000;
  private verifiedActiveMs: number = 0;
  private completedCycles: number = 0;
  private lastTickMs: number | null = null;
  private pauseStartMs: number | null = null;
  private pausedAccumulatedMs: number = 0;

  // Presence & awaiting_user state
  private faceLostAccumulatedMs: number = 0;
  private faceReturnAccumulatedMs: number = 0;
  private isAwaitingUser: boolean = false;
  private awaitingReason: AwaitingUserReason = null;
  private awaitingUserElapsedMs: number = 0;
  private isAwaitingTimeout: boolean = false;

  // Two-stage step signal compliance state (verifiable steps only)
  private complianceWindowElapsedMs: number = 0;
  private stage1ReminderSentInCycle: boolean = false;
  private pendingStage1Reminder: boolean = false;
  private pendingPauseSpeech: 'face_lost' | 'signal_missing' | null = null;
  private closureAccumulatedInWindowMs: number = 0;
  private closedSustainedMs: number = 0;
  private openSustainedMs: number = 0;

  // Counts & limits per step
  private checkPauseCount: number = 0;
  private reminderCount: number = 0;
  private promptCount: number = 0;
  private lastSpokenLineMs: number = -999999;
  private checkDisabledForRestOfStep: boolean = false;
  private continuedAnyway: boolean = false;

  // Signal & sensor availability tracking
  private rollingSamples: RollingMotionSample[] = [];
  private baselineHeadYaw: number | null = null;
  private baselineGazeH: number | null = null;
  private baselineGazeV: number | null = null;
  private maxHeadYawDelta: number = 0;
  private lastObservedBlinkTs: number | null = null;
  private signalDetectedOnStep: boolean = false;
  private cameraAvailableDuringStep: boolean = false;
  private gazeDataAvailableOnStep: boolean = false;
  private headRotationAvailableOnStep: boolean = false;
  private reliableFrames: number = 0;
  private lowConfidenceFrames: number = 0;

  private cameraUnavailableReason:
    | 'camera_off'
    | 'permission_denied'
    | 'face_lost'
    | 'face_obscured'
    | 'low_confidence'
    | 'stale_data'
    | null = null;
  private resumeTargetState: ExerciseVerificationState = 'INSTRUCT_CLOSE';
  private lastStatusCaption: CameraCheckStatusLine = 'Camera check: watching';
  private lastStatusInstruction: string = '';

  constructor(exerciseId = 'blink_complete', requiredDurationSeconds = 30) {
    this.reset(exerciseId, requiredDurationSeconds);
  }

  public reset(exerciseId = 'blink_complete', requiredDurationSeconds = 30): void {
    this.state = 'READY';
    this.exerciseId = exerciseId;
    this.requiredActiveMs = Math.max(1000, requiredDurationSeconds * 1000);
    this.verifiedActiveMs = 0;
    this.completedCycles = 0;
    this.lastTickMs = null;
    this.pauseStartMs = null;
    this.pausedAccumulatedMs = 0;

    this.faceLostAccumulatedMs = 0;
    this.faceReturnAccumulatedMs = 0;
    this.isAwaitingUser = false;
    this.awaitingReason = null;
    this.awaitingUserElapsedMs = 0;
    this.isAwaitingTimeout = false;

    this.complianceWindowElapsedMs = 0;
    this.stage1ReminderSentInCycle = false;
    this.pendingStage1Reminder = false;
    this.pendingPauseSpeech = null;
    this.closureAccumulatedInWindowMs = 0;
    this.closedSustainedMs = 0;
    this.openSustainedMs = 0;

    this.checkPauseCount = 0;
    this.reminderCount = 0;
    this.promptCount = 0;
    this.lastSpokenLineMs = -999999;
    this.checkDisabledForRestOfStep = false;
    this.continuedAnyway = false;

    this.rollingSamples = [];
    this.baselineHeadYaw = null;
    this.baselineGazeH = null;
    this.baselineGazeV = null;
    this.maxHeadYawDelta = 0;
    this.lastObservedBlinkTs = null;
    this.signalDetectedOnStep = false;
    this.cameraAvailableDuringStep = false;
    this.gazeDataAvailableOnStep = false;
    this.headRotationAvailableOnStep = false;
    this.reliableFrames = 0;
    this.lowConfidenceFrames = 0;

    this.cameraUnavailableReason = null;
    this.resumeTargetState = isOpenCloseEyeExercise(exerciseId)
      ? 'WAITING_FOR_EYES_CLOSED'
      : 'PERFORMING';
    this.lastStatusCaption = isExerciseVerifiable(exerciseId)
      ? 'Camera check: watching'
      : 'Camera check: presence only';
    this.lastStatusInstruction = EXERCISES[exerciseId]?.caption || '';
  }

  public getState(): ExerciseVerificationState {
    return this.state;
  }

  public getCompletedCycles(): number {
    return this.completedCycles;
  }

  public getCheckPauseCount(): number {
    return this.checkPauseCount;
  }

  public getReminderCount(): number {
    return this.reminderCount;
  }

  public getVerifiedActiveSeconds(): number {
    return Math.min(
      Math.round(this.requiredActiveMs / 1000),
      Math.floor(this.verifiedActiveMs / 1000)
    );
  }

  /**
   * Returns the truthful per-step cameraCheck status to persist in ExerciseSessionRecord
   * (OCURE_CAMERA_CHECK.md §6):
   * 'detected' | 'presence_only' | 'camera_unavailable' | 'continued_anyway' | 'check_off'
   * Never describes a presence_only step as verified.
   */
  public getStepCameraCheckStatus(cameraCheckEnabled = true): CameraCheckStatus {
    if (!cameraCheckEnabled) {
      return 'check_off';
    }
    if (this.continuedAnyway) {
      return 'continued_anyway';
    }
    if (!this.cameraAvailableDuringStep) {
      return 'camera_unavailable';
    }
    const stepVerifiable = isExerciseVerifiable(this.exerciseId, {
      hasGazeData: isGazeExercise(this.exerciseId) ? this.gazeDataAvailableOnStep : true,
      hasHeadRotation: this.exerciseId === 'head_turn' ? this.headRotationAvailableOnStep : true,
    });
    if (!stepVerifiable) {
      return 'presence_only';
    }
    if (this.signalDetectedOnStep || this.completedCycles >= 1) {
      return 'detected';
    }
    return 'presence_only';
  }

  /**
   * Starts the exercise step from READY.
   */
  public start(nowMs: number, customInitialInstruction?: string): ExerciseVerificationSnapshot {
    this.reset(this.exerciseId, Math.round(this.requiredActiveMs / 1000));
    this.lastTickMs = nowMs;

    const isOpenClose = isOpenCloseEyeExercise(this.exerciseId);
    this.state = isOpenClose ? 'INSTRUCT_CLOSE' : 'PERFORMING';
    this.resumeTargetState = isOpenClose ? 'WAITING_FOR_EYES_CLOSED' : 'PERFORMING';

    const initialScript = OCURE_SESSION_VOICE_SCRIPTS.instruct_close_initial;
    const spokenText =
      customInitialInstruction ||
      (isOpenClose
        ? initialScript.spokenText
        : EXERCISES[this.exerciseId]?.caption || initialScript.spokenText);
    const caption = spokenText;

    this.lastStatusCaption = isExerciseVerifiable(this.exerciseId)
      ? 'Camera check: watching'
      : 'Camera check: presence only';
    this.lastStatusInstruction = caption;

    return this.buildSnapshot({
      detectedEyeState: 'open',
      isTimerAdvancing: true,
      isActionTimedOut: false,
      promptToSpeak: {
        id: `${this.exerciseId}_instruct_start_${nowMs}`,
        spokenText,
        caption,
        context: 'instruction',
        isReminder: false,
      },
    });
  }

  /**
   * User clicked "Continue anyway" while in awaiting_user (OCURE_CAMERA_CHECK.md §2B & §2C).
   * Resumes the step immediately and marks continued_anyway. If MAX_PAUSES_PER_STEP has been
   * reached (or user explicitly bypasses), turns off camera check for the rest of this step.
   */
  public continueAnyway(nowMs: number): ExerciseVerificationSnapshot {
    this.lastTickMs = nowMs;
    this.isAwaitingUser = false;
    this.awaitingReason = null;
    this.awaitingUserElapsedMs = 0;
    this.isAwaitingTimeout = false;
    this.faceLostAccumulatedMs = 0;
    this.faceReturnAccumulatedMs = 0;
    this.complianceWindowElapsedMs = 0;
    this.stage1ReminderSentInCycle = false;
    this.pendingStage1Reminder = false;
    this.pendingPauseSpeech = null;
    this.continuedAnyway = true;
    this.checkDisabledForRestOfStep = true;
    this.state = isOpenCloseEyeExercise(this.exerciseId)
      ? this.resumeTargetState
      : 'PERFORMING';
    this.lastStatusCaption = isExerciseVerifiable(this.exerciseId)
      ? 'Camera check: watching'
      : 'Camera check: presence only';

    return this.buildSnapshot({
      detectedEyeState: 'open',
      isTimerAdvancing: true,
      isActionTimedOut: false,
      promptToSpeak: null,
    });
  }

  public pause(nowMs: number): ExerciseVerificationSnapshot {
    if (
      this.state !== 'COMPLETED' &&
      this.state !== 'READY' &&
      this.state !== 'PAUSED'
    ) {
      if (this.lastTickMs !== null && !this.isAwaitingUser) {
        const rawDeltaMs = Math.max(0, Math.min(2000, nowMs - this.lastTickMs));
        this.verifiedActiveMs = Math.min(this.requiredActiveMs, this.verifiedActiveMs + rawDeltaMs);
      }
      this.resumeTargetState =
        this.state === 'INSTRUCT_OPEN' || this.state === 'WAITING_FOR_EYES_OPEN'
          ? 'WAITING_FOR_EYES_OPEN'
          : isOpenCloseEyeExercise(this.exerciseId)
          ? 'WAITING_FOR_EYES_CLOSED'
          : 'PERFORMING';
      this.state = 'PAUSED';
      this.pauseStartMs = nowMs;
      // Clear any active camera-check pause when manual Pause is engaged
      this.isAwaitingUser = false;
      this.awaitingReason = null;
      this.awaitingUserElapsedMs = 0;
    }
    this.lastTickMs = nowMs;
    return this.buildSnapshot({
      detectedEyeState: 'transitioning',
      isTimerAdvancing: false,
      isActionTimedOut: false,
      promptToSpeak: null,
    });
  }

  public resume(nowMs: number): ExerciseVerificationSnapshot {
    if (this.state === 'PAUSED') {
      if (this.pauseStartMs !== null) {
        this.pausedAccumulatedMs += Math.max(0, nowMs - this.pauseStartMs);
        this.pauseStartMs = null;
      }
      this.lastTickMs = nowMs;
      this.closedSustainedMs = 0;
      this.openSustainedMs = 0;
      this.faceLostAccumulatedMs = 0;
      this.faceReturnAccumulatedMs = 0;
      this.complianceWindowElapsedMs = 0;
      this.stage1ReminderSentInCycle = false;
      this.pendingStage1Reminder = false;
      this.pendingPauseSpeech = null;
      this.isAwaitingUser = false;
      this.awaitingReason = null;
      this.awaitingUserElapsedMs = 0;

      const isOpenClose = isOpenCloseEyeExercise(this.exerciseId);
      this.state = isOpenClose ? this.resumeTargetState : 'PERFORMING';
      this.lastStatusCaption = isExerciseVerifiable(this.exerciseId)
        ? 'Camera check: watching'
        : 'Camera check: presence only';

      // OCURE_VOICE.md §2: Resume does not replay old lines
      return this.buildSnapshot({
        detectedEyeState: 'open',
        isTimerAdvancing: true,
        isActionTimedOut: false,
        promptToSpeak: null,
      });
    }
    return this.buildSnapshot({
      detectedEyeState: 'transitioning',
      isTimerAdvancing: false,
      isActionTimedOut: false,
      promptToSpeak: null,
    });
  }

  /**
   * Emits a camera check spoken line only if at least MIN_SECONDS_BETWEEN_SPOKEN_LINES (8 s)
   * have elapsed since the last spoken camera line and no other speech is active.
   */
  private tryEmitCameraSpeech(
    nowMs: number,
    idSuffix: string,
    spokenText: string,
    isSpeechActive: boolean
  ): VerificationSpeechPrompt | null {
    if (isSpeechActive) {
      return null;
    }
    const minCooldownMs = OCURE_CAMERA_CHECK_CONFIG.MIN_SECONDS_BETWEEN_SPOKEN_LINES * 1000;
    if (nowMs - this.lastSpokenLineMs < minCooldownMs) {
      return null;
    }
    this.lastSpokenLineMs = nowMs;
    this.promptCount += 1;
    this.lastStatusInstruction = spokenText;
    return {
      id: `${this.exerciseId}_${idSuffix}_${this.promptCount}_${nowMs}`,
      spokenText,
      caption: spokenText,
      context: 'camera_warning',
      isReminder: true,
    };
  }

  /**
   * Evaluates whether the expected step signal for a verifiable step has appeared
   * in the current frame / compliance window (OCURE_CAMERA_CHECK.md §4).
   */
  private evaluateStepSignal(
    sample: EyeVerificationFrameSample,
    rawDeltaMs: number,
    nowMs: number
  ): {
    stepIsVerifiableNow: boolean;
    signalSatisfiedNow: boolean;
    signalInProgressNow: boolean;
  } {
    if (isPresenceOnlyExercise(this.exerciseId)) {
      return {
        stepIsVerifiableNow: false,
        signalSatisfiedNow: true,
        signalInProgressNow: true,
      };
    }

    const yaw = sample.headYaw ?? 0;
    const pitch = sample.headPitch ?? 0;
    const gazeH = sample.gazeHorizontal ?? 0;
    const gazeV = sample.gazeVertical ?? 0;
    const ear = sample.combinedAperture > 0 ? sample.combinedAperture : 0.28;
    const closureScore = sample.eyeClosureScore ?? 0;

    if (typeof sample.headYaw === 'number') {
      this.headRotationAvailableOnStep = true;
    }
    if (typeof sample.gazeHorizontal === 'number' || typeof sample.gazeVertical === 'number') {
      this.gazeDataAvailableOnStep = true;
    }

    if (this.baselineHeadYaw === null) this.baselineHeadYaw = yaw;
    if (this.baselineGazeH === null) this.baselineGazeH = gazeH;
    if (this.baselineGazeV === null) this.baselineGazeV = gazeV;

    this.rollingSamples.push({
      timestampMs: nowMs,
      gazeH,
      gazeV,
      yaw,
      pitch,
      ear,
      closureScore,
    });
    const cutoffMs = nowMs - 4000;
    while (this.rollingSamples.length > 1 && this.rollingSamples[0].timestampMs < cutoffMs) {
      this.rollingSamples.shift();
    }

    let minGazeH = gazeH,
      maxGazeH = gazeH;
    let minGazeV = gazeV,
      maxGazeV = gazeV;
    let minYaw = yaw,
      maxYaw = yaw;
    let minEar = ear,
      maxEar = ear;
    for (const s of this.rollingSamples) {
      if (s.gazeH < minGazeH) minGazeH = s.gazeH;
      if (s.gazeH > maxGazeH) maxGazeH = s.gazeH;
      if (s.gazeV < minGazeV) minGazeV = s.gazeV;
      if (s.gazeV > maxGazeV) maxGazeV = s.gazeV;
      if (s.yaw < minYaw) minYaw = s.yaw;
      if (s.yaw > maxYaw) maxYaw = s.yaw;
      if (s.ear < minEar) minEar = s.ear;
      if (s.ear > maxEar) maxEar = s.ear;
    }

    const rollingGazeHRange = maxGazeH - minGazeH;
    const rollingGazeVRange = maxGazeV - minGazeV;
    const rollingYawRange = maxYaw - minYaw;
    const rollingEarRange = maxEar - minEar;

    const isEyesClosedNow = isFrameEyesClosed(sample);
    let newBlinkOccurred = false;
    if (
      typeof sample.lastBlinkTimestamp === 'number' &&
      sample.lastBlinkTimestamp > 0 &&
      sample.lastBlinkTimestamp !== this.lastObservedBlinkTs
    ) {
      this.lastObservedBlinkTs = sample.lastBlinkTimestamp;
      newBlinkOccurred = true;
    }

    switch (this.exerciseId) {
      case 'blink_complete': {
        // Expected signal: at least one blink event per window (OCURE_CAMERA_CHECK.md §4)
        const hasBlinkSignal =
          newBlinkOccurred ||
          isEyesClosedNow ||
          closureScore >= 0.38 ||
          sample.blinkState === 'CLOSING' ||
          sample.blinkState === 'CLOSED' ||
          sample.blinkState === 'REOPENING';
        return {
          stepIsVerifiableNow: true,
          signalSatisfiedNow: hasBlinkSignal,
          signalInProgressNow: hasBlinkSignal,
        };
      }

      case 'eye_closure': {
        // Expected signal: eyes closed at least CLOSURE_MIN_SECONDS (default 2 s) once per window
        const isClosed =
          isEyesClosedNow || closureScore >= 0.32 || sample.blinkState !== 'OPEN';
        if (isClosed) {
          this.closureAccumulatedInWindowMs += rawDeltaMs;
        }
        const minClosureMs = OCURE_CAMERA_CHECK_CONFIG.CLOSURE_MIN_SECONDS * 1000;
        const satisfied =
          this.closureAccumulatedInWindowMs >= minClosureMs ||
          (this.isAwaitingUser && isClosed && this.closureAccumulatedInWindowMs >= 300);
        return {
          stepIsVerifiableNow: true,
          signalSatisfiedNow: satisfied,
          signalInProgressNow: isClosed,
        };
      }

      case 'head_turn': {
        if (!this.headRotationAvailableOnStep) {
          return {
            stepIsVerifiableNow: false,
            signalSatisfiedNow: true,
            signalInProgressNow: true,
          };
        }
        const yawDelta = Math.abs(yaw - this.baselineHeadYaw);
        if (yawDelta > this.maxHeadYawDelta) {
          this.maxHeadYawDelta = yawDelta;
        }
        const minDeg = OCURE_CAMERA_CHECK_CONFIG.HEAD_TURN_MIN_DEGREES;
        const satisfied = yawDelta >= minDeg || rollingYawRange >= minDeg;
        const inProgress = yawDelta >= minDeg * 0.6 || rollingYawRange >= minDeg * 0.6;
        return {
          stepIsVerifiableNow: true,
          signalSatisfiedNow: satisfied,
          signalInProgressNow: inProgress,
        };
      }

      case 'eyes_horizontal': {
        if (!this.gazeDataAvailableOnStep) {
          return {
            stepIsVerifiableNow: false,
            signalSatisfiedNow: true,
            signalInProgressNow: true,
          };
        }
        const deltaH = Math.abs(gazeH - this.baselineGazeH);
        const lrAsymmetry =
          typeof sample.leftEyeAperture === 'number' &&
          typeof sample.rightEyeAperture === 'number'
            ? Math.abs(sample.leftEyeAperture - sample.rightEyeAperture)
            : 0;
        const headRoughlyStill = Math.abs(yaw - this.baselineHeadYaw) <= 24;
        const hasGaze =
          headRoughlyStill &&
          (deltaH >= 0.06 || rollingGazeHRange >= 0.075 || lrAsymmetry >= 0.025);
        return {
          stepIsVerifiableNow: true,
          signalSatisfiedNow: hasGaze,
          signalInProgressNow: hasGaze,
        };
      }

      case 'eyes_vertical': {
        if (!this.gazeDataAvailableOnStep) {
          return {
            stepIsVerifiableNow: false,
            signalSatisfiedNow: true,
            signalInProgressNow: true,
          };
        }
        const deltaV = Math.abs(gazeV - this.baselineGazeV);
        const headRoughlyStill = Math.abs(yaw - this.baselineHeadYaw) <= 24;
        const hasGaze =
          headRoughlyStill &&
          (deltaV >= 0.055 ||
            rollingGazeVRange >= 0.07 ||
            (rollingEarRange >= 0.024 && !isEyesClosedNow));
        return {
          stepIsVerifiableNow: true,
          signalSatisfiedNow: hasGaze,
          signalInProgressNow: hasGaze,
        };
      }

      case 'eyes_diagonal': {
        if (!this.gazeDataAvailableOnStep) {
          return {
            stepIsVerifiableNow: false,
            signalSatisfiedNow: true,
            signalInProgressNow: true,
          };
        }
        const deltaH = Math.abs(gazeH - this.baselineGazeH);
        const deltaV = Math.abs(gazeV - this.baselineGazeV);
        const diagDist = Math.hypot(deltaH, deltaV);
        const rollingDiagSpan = Math.hypot(rollingGazeHRange, rollingGazeVRange);
        const headRoughlyStill = Math.abs(yaw - this.baselineHeadYaw) <= 25;
        const hasGaze =
          headRoughlyStill &&
          (diagDist >= 0.07 ||
            rollingDiagSpan >= 0.085 ||
            (rollingEarRange >= 0.025 && (rollingGazeHRange >= 0.04 || rollingGazeVRange >= 0.04)));
        return {
          stepIsVerifiableNow: true,
          signalSatisfiedNow: hasGaze,
          signalInProgressNow: hasGaze,
        };
      }

      default:
        return {
          stepIsVerifiableNow: false,
          signalSatisfiedNow: true,
          signalInProgressNow: true,
        };
    }
  }

  /**
   * Advances the Revision 5 Camera Check state machine using a live camera/telemetry sample.
   */
  public tick(sample: EyeVerificationFrameSample): ExerciseVerificationSnapshot {
    const nowMs = sample.timestampMs;
    const rawDeltaMs =
      this.lastTickMs !== null ? Math.max(0, Math.min(2000, nowMs - this.lastTickMs)) : 33;
    this.lastTickMs = nowMs;

    if (this.state === 'READY' || this.state === 'COMPLETED' || this.state === 'PAUSED') {
      return this.buildSnapshot({
        detectedEyeState: 'transitioning',
        isTimerAdvancing: false,
        isActionTimedOut: false,
        promptToSpeak: null,
      });
    }

    const cameraCheckEnabled = sample.cameraCheckEnabled !== false;
    const isSpeechActive = Boolean(sample.isSpeechActive);
    const isPermissionDenied = sample.cameraStatus === 'error';
    const cameraRunning =
      sample.isMonitoring &&
      (sample.cameraStatus === 'active' || sample.cameraStatus === 'running');
    const isStale = (sample.frameAgeMs ?? 0) > OCURE_CAMERA_CHECK_CONFIG.MAX_FRAME_STALE_MS;
    const isTrackerWarmingUp = Boolean(sample.trackerWarmingUp);

    // 1. If Camera Check is switched OFF: never pause, timer advances as a plain timer
    if (!cameraCheckEnabled) {
      this.isAwaitingUser = false;
      this.awaitingReason = null;
      this.awaitingUserElapsedMs = 0;
      this.cameraUnavailableReason = null;
      this.verifiedActiveMs = Math.min(this.requiredActiveMs, this.verifiedActiveMs + rawDeltaMs);
      const stepFinishedNow = this.verifiedActiveMs >= this.requiredActiveMs;
      this.lastStatusCaption = 'Camera check: off';
      if (stepFinishedNow) {
        this.state = 'COMPLETED';
      }
      return this.buildSnapshot({
        detectedEyeState: 'untracked',
        isTimerAdvancing: !stepFinishedNow,
        isActionTimedOut: false,
        promptToSpeak: null,
      });
    }

    // 2. Fail-open: Camera unavailable, permission denied, or stale tracker output
    // Must NEVER pause the session (OCURE_CAMERA_CHECK.md §1 & §7).
    if (!cameraRunning || isStale) {
      this.isAwaitingUser = false;
      this.awaitingReason = null;
      this.awaitingUserElapsedMs = 0;
      this.faceLostAccumulatedMs = 0;
      this.faceReturnAccumulatedMs = 0;
      this.complianceWindowElapsedMs = 0;
      this.cameraUnavailableReason = isPermissionDenied
        ? 'permission_denied'
        : !cameraRunning
        ? 'camera_off'
        : 'stale_data';
      this.verifiedActiveMs = Math.min(this.requiredActiveMs, this.verifiedActiveMs + rawDeltaMs);
      const stepFinishedNow = this.verifiedActiveMs >= this.requiredActiveMs;
      this.lastStatusCaption = 'Camera check: camera unavailable';
      if (stepFinishedNow) {
        this.state = 'COMPLETED';
      }
      return this.buildSnapshot({
        detectedEyeState: 'untracked',
        isTimerAdvancing: !stepFinishedNow,
        isActionTimedOut: false,
        promptToSpeak: null,
      });
    }

    // 3. Tracker warm-up: "No data yet" is NOT "no face": do nothing until tracker produces results
    if (isTrackerWarmingUp) {
      this.verifiedActiveMs = Math.min(this.requiredActiveMs, this.verifiedActiveMs + rawDeltaMs);
      const stepFinishedNow = this.verifiedActiveMs >= this.requiredActiveMs;
      this.lastStatusCaption = isExerciseVerifiable(this.exerciseId)
        ? 'Camera check: watching'
        : 'Camera check: presence only';
      if (stepFinishedNow) {
        this.state = 'COMPLETED';
      }
      return this.buildSnapshot({
        detectedEyeState: 'untracked',
        isTimerAdvancing: !stepFinishedNow,
        isActionTimedOut: false,
        promptToSpeak: null,
      });
    }

    this.cameraAvailableDuringStep = true;

    // 4. If check was disabled for the rest of this step (after MAX_PAUSES_PER_STEP = 2 or Continue anyway)
    if (this.checkDisabledForRestOfStep) {
      this.isAwaitingUser = false;
      this.awaitingReason = null;
      this.awaitingUserElapsedMs = 0;
      this.verifiedActiveMs = Math.min(this.requiredActiveMs, this.verifiedActiveMs + rawDeltaMs);
      const stepFinishedNow = this.verifiedActiveMs >= this.requiredActiveMs;
      this.lastStatusCaption = isExerciseVerifiable(this.exerciseId)
        ? 'Camera check: watching'
        : 'Camera check: presence only';
      if (stepFinishedNow) {
        this.state = 'COMPLETED';
      } else {
        this.state = isOpenCloseEyeExercise(this.exerciseId)
          ? this.resumeTargetState
          : 'PERFORMING';
      }
      return this.buildSnapshot({
        detectedEyeState: isFrameEyesClosed(sample) ? 'closed' : 'open',
        isTimerAdvancing: !stepFinishedNow,
        isActionTimedOut: false,
        promptToSpeak: null,
      });
    }

    // 5. Presence Check (every step, OCURE_CAMERA_CHECK.md §2A):
    // Face not detected for FACE_LOST_PAUSE_SECONDS (3 s) -> enter awaiting_user (reason 'face_lost')
    if (!sample.faceDetected) {
      this.faceLostAccumulatedMs += rawDeltaMs;
      this.faceReturnAccumulatedMs = 0;
      this.closedSustainedMs = 0;
      this.openSustainedMs = 0;
      this.cameraUnavailableReason = 'face_lost';

      const facePauseThresholdMs = OCURE_CAMERA_CHECK_CONFIG.FACE_LOST_PAUSE_SECONDS * 1000;

      if (this.isAwaitingUser && this.awaitingReason === 'face_lost') {
        this.awaitingUserElapsedMs += rawDeltaMs;
        if (
          this.awaitingUserElapsedMs >=
          OCURE_CAMERA_CHECK_CONFIG.AWAITING_USER_TIMEOUT_SECONDS * 1000
        ) {
          this.isAwaitingTimeout = true;
        }
        let prompt: VerificationSpeechPrompt | null = null;
        if (this.pendingPauseSpeech === 'face_lost') {
          prompt = this.tryEmitCameraSpeech(
            nowMs,
            'camera_pause_presence',
            OCURE_SESSION_VOICE_SCRIPTS.camera_pause_presence.spokenText,
            isSpeechActive
          );
          if (prompt) {
            this.pendingPauseSpeech = null;
          }
        }
        this.lastStatusCaption = "Paused: we can't see you";
        return this.buildSnapshot({
          detectedEyeState: 'untracked',
          isTimerAdvancing: false,
          isActionTimedOut: true,
          promptToSpeak: prompt,
        });
      }

      if (this.faceLostAccumulatedMs >= facePauseThresholdMs) {
        if (this.checkPauseCount < OCURE_CAMERA_CHECK_CONFIG.MAX_PAUSES_PER_STEP) {
          if (!this.isAwaitingUser) {
            this.checkPauseCount += 1;
          }
          this.isAwaitingUser = true;
          this.awaitingReason = 'face_lost';
          this.awaitingUserElapsedMs = 0;
          this.state = 'AWAITING_USER';
          this.lastStatusCaption = "Paused: we can't see you";
          this.pendingPauseSpeech = 'face_lost';

          const prompt = this.tryEmitCameraSpeech(
            nowMs,
            'camera_pause_presence',
            OCURE_SESSION_VOICE_SCRIPTS.camera_pause_presence.spokenText,
            isSpeechActive
          );
          if (prompt) {
            this.pendingPauseSpeech = null;
          }

          return this.buildSnapshot({
            detectedEyeState: 'untracked',
            isTimerAdvancing: false,
            isActionTimedOut: true,
            promptToSpeak: prompt,
          });
        } else {
          // Reached MAX_PAUSES_PER_STEP: turn off check for rest of step (continued_anyway)
          this.checkDisabledForRestOfStep = true;
          this.continuedAnyway = true;
          this.isAwaitingUser = false;
          this.awaitingReason = null;
        }
      }

      // Under 3 s of face loss (or while already paused for signal_missing):
      if (this.isAwaitingUser) {
        this.awaitingUserElapsedMs += rawDeltaMs;
        if (
          this.awaitingUserElapsedMs >=
          OCURE_CAMERA_CHECK_CONFIG.AWAITING_USER_TIMEOUT_SECONDS * 1000
        ) {
          this.isAwaitingTimeout = true;
        }
        return this.buildSnapshot({
          detectedEyeState: 'untracked',
          isTimerAdvancing: false,
          isActionTimedOut: true,
          promptToSpeak: null,
        });
      }

      this.verifiedActiveMs = Math.min(this.requiredActiveMs, this.verifiedActiveMs + rawDeltaMs);
      const stepFinishedNow = this.verifiedActiveMs >= this.requiredActiveMs;
      this.lastStatusCaption = isExerciseVerifiable(this.exerciseId)
        ? 'Camera check: watching'
        : 'Camera check: presence only';
      if (stepFinishedNow) {
        this.state = 'COMPLETED';
      }

      return this.buildSnapshot({
        detectedEyeState: 'untracked',
        isTimerAdvancing: !stepFinishedNow,
        isActionTimedOut: false,
        promptToSpeak: null,
      });
    }

    // Face IS detected!
    this.faceLostAccumulatedMs = 0;

    // Handle auto-resume from 'face_lost' after FACE_RETURN_RESUME_SECONDS (1 s)
    // with NO spoken line on resume (OCURE_CAMERA_CHECK.md §2A)
    if (this.isAwaitingUser && this.awaitingReason === 'face_lost') {
      this.faceReturnAccumulatedMs += rawDeltaMs;
      const resumeThresholdMs = OCURE_CAMERA_CHECK_CONFIG.FACE_RETURN_RESUME_SECONDS * 1000;
      if (this.faceReturnAccumulatedMs >= resumeThresholdMs) {
        this.isAwaitingUser = false;
        this.awaitingReason = null;
        this.awaitingUserElapsedMs = 0;
        this.faceReturnAccumulatedMs = 0;
        this.pendingPauseSpeech = null;
        this.complianceWindowElapsedMs = 0;
        this.stage1ReminderSentInCycle = false;
        if (this.checkPauseCount >= OCURE_CAMERA_CHECK_CONFIG.MAX_PAUSES_PER_STEP) {
          this.checkDisabledForRestOfStep = true;
          this.continuedAnyway = true;
        }
        this.state = isOpenCloseEyeExercise(this.exerciseId)
          ? this.resumeTargetState
          : 'PERFORMING';
      } else {
        this.awaitingUserElapsedMs += rawDeltaMs;
        if (
          this.awaitingUserElapsedMs >=
          OCURE_CAMERA_CHECK_CONFIG.AWAITING_USER_TIMEOUT_SECONDS * 1000
        ) {
          this.isAwaitingTimeout = true;
        }
        this.lastStatusCaption = "Paused: we can't see you";
        return this.buildSnapshot({
          detectedEyeState: 'transitioning',
          isTimerAdvancing: false,
          isActionTimedOut: true,
          promptToSpeak: null,
        });
      }
    }

    // 6. Fail-open on Low Confidence / Glare / Glasses / Partial Occlusion (OCURE_CAMERA_CHECK.md §1 & §7):
    // Low confidence must NEVER pause the session for a missing signal.
    const isLowConfidence =
      Boolean(sample.faceObscured) ||
      sample.isReliable === false ||
      sample.trackingQuality === 'Low' ||
      sample.trackingQuality === 'Lost';

    if (isLowConfidence) {
      this.lowConfidenceFrames += 1;
      this.closedSustainedMs = 0;
      this.openSustainedMs = 0;
      this.complianceWindowElapsedMs = 0;
      this.cameraUnavailableReason = sample.faceObscured ? 'face_obscured' : 'low_confidence';

      // If we were paused waiting for a step signal and lighting/glare drops confidence, fail-open!
      if (this.isAwaitingUser && this.awaitingReason === 'signal_missing') {
        this.isAwaitingUser = false;
        this.awaitingReason = null;
        this.awaitingUserElapsedMs = 0;
      }

      this.verifiedActiveMs = Math.min(this.requiredActiveMs, this.verifiedActiveMs + rawDeltaMs);
      const stepFinishedNow = this.verifiedActiveMs >= this.requiredActiveMs;
      this.state = stepFinishedNow
        ? 'COMPLETED'
        : sample.faceObscured
        ? 'FACE_OBSCURED'
        : 'LOW_CONFIDENCE';
      this.lastStatusCaption = isExerciseVerifiable(this.exerciseId)
        ? 'Camera check: watching'
        : 'Camera check: presence only';

      return this.buildSnapshot({
        detectedEyeState: 'transitioning',
        isTimerAdvancing: !stepFinishedNow,
        isActionTimedOut: false,
        promptToSpeak: null,
      });
    }

    // 7. Reliable face tracking
    this.reliableFrames += 1;
    this.cameraUnavailableReason = null;

    const isEyesClosed = isFrameEyesClosed(sample);
    const isEyesOpen = isFrameEyesOpen(sample);
    const detectedEyeState: 'closed' | 'open' | 'transitioning' = isEyesClosed
      ? 'closed'
      : isEyesOpen
      ? 'open'
      : 'transitioning';

    const signalEval = this.evaluateStepSignal(sample, rawDeltaMs, nowMs);
    const stepVerifiable = signalEval.stepIsVerifiableNow;

    if (signalEval.signalSatisfiedNow && stepVerifiable) {
      this.signalDetectedOnStep = true;
      this.complianceWindowElapsedMs = 0;
      this.stage1ReminderSentInCycle = false;
      this.pendingStage1Reminder = false;
      this.closureAccumulatedInWindowMs = 0;
    }

    // 8. If currently in awaiting_user (reason: 'signal_missing'):
    // Auto-resume as soon as the signal appears!
    if (this.isAwaitingUser && this.awaitingReason === 'signal_missing') {
      if (signalEval.signalSatisfiedNow || signalEval.signalInProgressNow) {
        this.signalDetectedOnStep = true;
        this.isAwaitingUser = false;
        this.awaitingReason = null;
        this.awaitingUserElapsedMs = 0;
        this.complianceWindowElapsedMs = 0;
        this.stage1ReminderSentInCycle = false;
        this.pendingStage1Reminder = false;
        this.pendingPauseSpeech = null;
        if (this.checkPauseCount >= OCURE_CAMERA_CHECK_CONFIG.MAX_PAUSES_PER_STEP) {
          this.checkDisabledForRestOfStep = true;
          this.continuedAnyway = true;
        }
        this.state = isOpenCloseEyeExercise(this.exerciseId)
          ? this.resumeTargetState
          : 'PERFORMING';
      } else {
        this.awaitingUserElapsedMs += rawDeltaMs;
        if (
          this.awaitingUserElapsedMs >=
          OCURE_CAMERA_CHECK_CONFIG.AWAITING_USER_TIMEOUT_SECONDS * 1000
        ) {
          this.isAwaitingTimeout = true;
        }
        let prompt: VerificationSpeechPrompt | null = null;
        if (this.pendingPauseSpeech === 'signal_missing') {
          prompt = this.tryEmitCameraSpeech(
            nowMs,
            'camera_pause_signal',
            OCURE_SESSION_VOICE_SCRIPTS.camera_pause_signal.spokenText,
            isSpeechActive
          );
          if (prompt) {
            this.pendingPauseSpeech = null;
          }
        }
        this.lastStatusCaption = 'Paused: waiting for the step';
        return this.buildSnapshot({
          detectedEyeState,
          isTimerAdvancing: false,
          isActionTimedOut: true,
          promptToSpeak: prompt,
        });
      }
    }

    // 9. Two-stage step signal compliance check (verifiable steps only, OCURE_CAMERA_CHECK.md §2B):
    // Stage 1: After STEP_GRACE_SECONDS (5 s) of ACTIVE step time, if expected signal has not
    //          appeared within COMPLIANCE_WINDOW_SECONDS (10 s) -> spoken reminder
    //          "Let's keep going." + step caption. Session keeps running!
    // Stage 2: If signal is still absent after one more COMPLIANCE_WINDOW_SECONDS (10 s) ->
    //          enter awaiting_user (reason 'signal_missing'), pause clock & clip, speak
    //          "Paused. Do the step to continue."
    const graceMs = OCURE_CAMERA_CHECK_CONFIG.STEP_GRACE_SECONDS * 1000;
    const windowMs = OCURE_CAMERA_CHECK_CONFIG.COMPLIANCE_WINDOW_SECONDS * 1000;
    let stagePrompt: VerificationSpeechPrompt | null = null;

    if (stepVerifiable && !this.checkDisabledForRestOfStep) {
      const nextVerifiedActiveMs = this.verifiedActiveMs + rawDeltaMs;
      if (nextVerifiedActiveMs > graceMs && !signalEval.signalSatisfiedNow) {
        const activeDeltaAfterGrace =
          this.verifiedActiveMs >= graceMs ? rawDeltaMs : nextVerifiedActiveMs - graceMs;
        this.complianceWindowElapsedMs += activeDeltaAfterGrace;

        // Stage 1: First COMPLIANCE_WINDOW_SECONDS (10 s) elapsed after grace without signal
        if (this.complianceWindowElapsedMs >= windowMs && !this.stage1ReminderSentInCycle) {
          this.stage1ReminderSentInCycle = true;
          this.reminderCount += 1;
          this.pendingStage1Reminder = true;
        }

        if (this.pendingStage1Reminder && this.complianceWindowElapsedMs < windowMs * 2) {
          const reminderText = buildCameraSignalReminderText(this.exerciseId);
          stagePrompt = this.tryEmitCameraSpeech(
            nowMs,
            'camera_signal_reminder',
            reminderText,
            isSpeechActive
          );
          if (stagePrompt) {
            this.pendingStage1Reminder = false;
          }
        }

        // Stage 2: Second COMPLIANCE_WINDOW_SECONDS (20 s after grace) elapsed without signal
        if (this.complianceWindowElapsedMs >= windowMs * 2) {
          if (this.checkPauseCount < OCURE_CAMERA_CHECK_CONFIG.MAX_PAUSES_PER_STEP) {
            this.checkPauseCount += 1;
            this.isAwaitingUser = true;
            this.awaitingReason = 'signal_missing';
            this.awaitingUserElapsedMs = 0;
            this.pendingStage1Reminder = false;
            this.pendingPauseSpeech = 'signal_missing';
            this.state = 'AWAITING_USER';
            this.lastStatusCaption = 'Paused: waiting for the step';

            const pausePrompt = this.tryEmitCameraSpeech(
              nowMs,
              'camera_pause_signal',
              OCURE_SESSION_VOICE_SCRIPTS.camera_pause_signal.spokenText,
              isSpeechActive
            );
            if (pausePrompt) {
              this.pendingPauseSpeech = null;
            }

            return this.buildSnapshot({
              detectedEyeState,
              isTimerAdvancing: false,
              isActionTimedOut: true,
              promptToSpeak: pausePrompt,
            });
          } else {
            this.checkDisabledForRestOfStep = true;
            this.continuedAnyway = true;
          }
        }
      }
    }

    // 10. Advance active step time
    this.verifiedActiveMs = Math.min(this.requiredActiveMs, this.verifiedActiveMs + rawDeltaMs);
    const stepFinishedNow = this.verifiedActiveMs >= this.requiredActiveMs;

    this.lastStatusCaption = stepVerifiable
      ? 'Camera check: watching'
      : 'Camera check: presence only';

    // 10A. Non-open/close exercise steps
    if (!isOpenCloseEyeExercise(this.exerciseId)) {
      this.state = stepFinishedNow ? 'COMPLETED' : 'PERFORMING';
      return this.buildSnapshot({
        detectedEyeState,
        isTimerAdvancing: !stepFinishedNow,
        isActionTimedOut: false,
        promptToSpeak: stagePrompt,
      });
    }

    // 10B. Open/Close Eye Exercises (`blink_complete` and `eye_closure`): track rep cycles
    const requiredCloseConfirmMs =
      this.exerciseId === 'eye_closure'
        ? OCURE_CAMERA_CHECK_CONFIG.EYE_CLOSURE_HOLD_MIN_MS
        : OCURE_CAMERA_CHECK_CONFIG.BLINK_CLOSED_MIN_MS;
    const requiredOpenConfirmMs = OCURE_CAMERA_CHECK_CONFIG.OPEN_CONFIRM_MIN_MS;

    if (
      this.state === 'INSTRUCT_CLOSE' ||
      this.state === 'PERFORMING' ||
      this.state === 'AWAITING_USER' ||
      this.state === 'ACTIVITY_PAUSED'
    ) {
      this.state = 'WAITING_FOR_EYES_CLOSED';
      this.resumeTargetState = 'WAITING_FOR_EYES_CLOSED';
      this.closedSustainedMs = 0;
      this.openSustainedMs = 0;
    } else if (this.state === 'INSTRUCT_OPEN') {
      this.state = 'WAITING_FOR_EYES_OPEN';
      this.resumeTargetState = 'WAITING_FOR_EYES_OPEN';
      this.openSustainedMs = 0;
      this.closedSustainedMs = 0;
    }

    if (stepFinishedNow) {
      if (
        this.state === 'WAITING_FOR_EYES_OPEN' &&
        isEyesOpen &&
        this.openSustainedMs + rawDeltaMs >= requiredOpenConfirmMs
      ) {
        this.completedCycles += 1;
      }
      this.state = 'COMPLETED';
      return this.buildSnapshot({
        detectedEyeState,
        isTimerAdvancing: false,
        isActionTimedOut: false,
        promptToSpeak: stagePrompt,
      });
    }

    if (this.state === 'WAITING_FOR_EYES_CLOSED') {
      if (isEyesClosed) {
        this.closedSustainedMs += rawDeltaMs;
      } else {
        this.closedSustainedMs = 0;
      }

      if (this.closedSustainedMs >= requiredCloseConfirmMs) {
        this.signalDetectedOnStep = true;
        this.state = 'INSTRUCT_OPEN';
        this.resumeTargetState = 'WAITING_FOR_EYES_OPEN';
        this.closedSustainedMs = 0;
        this.openSustainedMs = 0;

        const script = OCURE_SESSION_VOICE_SCRIPTS.instruct_open;
        this.lastStatusInstruction = script.spokenText;

        return this.buildSnapshot({
          detectedEyeState: 'closed',
          isTimerAdvancing: true,
          isActionTimedOut: false,
          promptToSpeak:
            stagePrompt ||
            (isSpeechActive
              ? null
              : {
                  id: `${this.exerciseId}_instruct_open_${this.completedCycles}_${nowMs}`,
                  spokenText: script.spokenText,
                  caption: script.spokenText,
                  context: script.context,
                  isReminder: false,
                }),
        });
      }

      return this.buildSnapshot({
        detectedEyeState,
        isTimerAdvancing: true,
        isActionTimedOut: false,
        promptToSpeak: stagePrompt,
      });
    }

    if (this.state === 'WAITING_FOR_EYES_OPEN') {
      if (isEyesOpen) {
        this.openSustainedMs += rawDeltaMs;
      } else {
        this.openSustainedMs = 0;
      }

      if (this.openSustainedMs >= requiredOpenConfirmMs) {
        this.completedCycles += 1;
        this.signalDetectedOnStep = true;
        this.openSustainedMs = 0;
        this.closedSustainedMs = 0;
        this.state = 'INSTRUCT_CLOSE';
        this.resumeTargetState = 'WAITING_FOR_EYES_CLOSED';

        const script = OCURE_SESSION_VOICE_SCRIPTS.instruct_close_next;
        this.lastStatusInstruction = script.spokenText;

        return this.buildSnapshot({
          detectedEyeState: 'open',
          isTimerAdvancing: true,
          isActionTimedOut: false,
          promptToSpeak:
            stagePrompt ||
            (isSpeechActive
              ? null
              : {
                  id: `${this.exerciseId}_instruct_close_${this.completedCycles}_${nowMs}`,
                  spokenText: script.spokenText,
                  caption: script.spokenText,
                  context: script.context,
                  isReminder: false,
                }),
        });
      }

      return this.buildSnapshot({
        detectedEyeState,
        isTimerAdvancing: true,
        isActionTimedOut: false,
        promptToSpeak: stagePrompt,
      });
    }

    return this.buildSnapshot({
      detectedEyeState,
      isTimerAdvancing: true,
      isActionTimedOut: false,
      promptToSpeak: stagePrompt,
    });
  }

  private buildSnapshot(params: {
    detectedEyeState: 'closed' | 'open' | 'transitioning' | 'untracked';
    isTimerAdvancing: boolean;
    isActionTimedOut: boolean;
    promptToSpeak: VerificationSpeechPrompt | null;
  }): ExerciseVerificationSnapshot {
    const requiredSec = Math.round(this.requiredActiveMs / 1000);
    const verifiedSec = Math.min(requiredSec, Math.floor(this.verifiedActiveMs / 1000));
    return {
      state: this.state,
      exerciseId: this.exerciseId,
      isOpenCloseExercise: isOpenCloseEyeExercise(this.exerciseId),
      verifiedActiveMs: this.verifiedActiveMs,
      verifiedActiveSeconds: verifiedSec,
      requiredActiveSeconds: requiredSec,
      completedCycles: this.completedCycles,
      detectedEyeState: params.detectedEyeState,
      isTimerAdvancing: params.isTimerAdvancing,
      isActivityPaused: this.isAwaitingUser,
      isAwaitingUser: this.isAwaitingUser,
      awaitingReason: this.awaitingReason,
      awaitingUserSeconds: Math.floor(this.awaitingUserElapsedMs / 1000),
      isAwaitingTimeout: this.isAwaitingTimeout,
      isWaitingForAction:
        this.state === 'WAITING_FOR_EYES_CLOSED' ||
        this.state === 'WAITING_FOR_EYES_OPEN' ||
        this.state === 'INSTRUCT_CLOSE' ||
        this.state === 'INSTRUCT_OPEN' ||
        this.state === 'PERFORMING',
      isActionTimedOut: params.isActionTimedOut,
      cameraUnavailableReason: this.cameraUnavailableReason,
      statusCaption: this.lastStatusCaption,
      statusInstruction: this.lastStatusInstruction,
      promptToSpeak: params.promptToSpeak,
      promptCount: this.promptCount,
      checkPauseCount: this.checkPauseCount,
      reminderCount: this.reminderCount,
      continuedAnyway: this.continuedAnyway,
    };
  }
}

/**
 * Pure start-sequence timing evaluator for Criterion 17 (OCURE_VOICE.md §1):
 * - When Voice is ON and speech succeeds, the countdown starts immediately after intro speech completes,
 *   numerals 3, 2, 1 tick at exact 1.0 s intervals, and step 1 starts at countdownStartMs + 3000 ms.
 * - When Voice is OFF or speech errors/times out, the countdown begins within INTRO_MAX_WAIT_SECONDS (default 6 s).
 */
export function computeStartSequenceTimings(params: {
  clickStartMs: number;
  voiceEnabled: boolean;
  voiceAvailable: boolean;
  introSpeechDurationMs?: number;
  speechErrorAtMs?: number | null;
}): {
  introSpokenText: string;
  countdownStartMs: number;
  numeral3AtMs: number;
  numeral2AtMs: number;
  numeral1AtMs: number;
  step1StartMs: number;
  introWaitSeconds: number;
  speechCutOff: boolean;
} {
  const maxWaitMs = OCURE_CONFIG.INTRO_MAX_WAIT_SECONDS * 1000;
  let introWaitMs = 0;

  if (params.voiceEnabled && params.voiceAvailable) {
    if (typeof params.speechErrorAtMs === 'number' && params.speechErrorAtMs >= 0) {
      introWaitMs = Math.min(maxWaitMs, params.speechErrorAtMs);
    } else if (typeof params.introSpeechDurationMs === 'number' && params.introSpeechDurationMs > 0) {
      introWaitMs = Math.min(maxWaitMs, params.introSpeechDurationMs);
    }
  }

  const countdownStartMs = params.clickStartMs + introWaitMs;
  return {
    introSpokenText: OCURE_SESSION_VOICE_SCRIPTS.countdown_start.spokenText,
    countdownStartMs,
    numeral3AtMs: countdownStartMs,
    numeral2AtMs: countdownStartMs + 1000,
    numeral1AtMs: countdownStartMs + 2000,
    step1StartMs: countdownStartMs + 3000,
    introWaitSeconds: introWaitMs / 1000,
    speechCutOff: false,
  };
}

/**
 * Pure active-time session clock calculator for Criterion 16 (OCURE_CAMERA_CHECK.md §3):
 * elapsed = now - start - totalPausedTime (manual + check pauses).
 */
export function computeActiveSessionClock(params: {
  startMs: number;
  nowMs: number;
  manualPausedMs: number;
  checkPausedMs: number;
}): {
  activeElapsedMs: number;
  activeElapsedSeconds: number;
  stepIndex: number; // 0..3
  stepElapsedSeconds: number; // 0..30
  segmentFillsPct: [number, number, number, number];
  isComplete: boolean;
} {
  const totalPausedMs = Math.max(0, params.manualPausedMs) + Math.max(0, params.checkPausedMs);
  const rawActiveMs = Math.max(0, params.nowMs - params.startMs - totalPausedMs);
  const clampedActiveMs = Math.min(120000, rawActiveMs);
  const activeElapsedSeconds = clampedActiveMs / 1000;
  const isComplete = clampedActiveMs >= 120000;
  const stepIndex = isComplete ? 3 : Math.min(3, Math.floor(clampedActiveMs / 30000));
  const stepElapsedSeconds = isComplete
    ? 30
    : (clampedActiveMs - stepIndex * 30000) / 1000;

  const segmentFillsPct: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    if (isComplete || i < stepIndex) {
      segmentFillsPct[i] = 100;
    } else if (i === stepIndex) {
      segmentFillsPct[i] = Math.min(100, Math.max(0, (stepElapsedSeconds / 30) * 100));
    } else {
      segmentFillsPct[i] = 0;
    }
  }

  return {
    activeElapsedMs: clampedActiveMs,
    activeElapsedSeconds,
    stepIndex,
    stepElapsedSeconds,
    segmentFillsPct,
    isComplete,
  };
}

export type BlinkRateBand =
  | '0_10'
  | '10_20'
  | '20_30'
  | '30_40'
  | '40_50'
  | '50_plus';

export interface ClassificationResult {
  reliable: boolean;
  band: BlinkRateBand | null;
  unroundedRate: number | null;
  observationMinutes: number;
  coveragePct: number;
  statusLabel: string;
  suggestionPrompt?: string;
  escalationNote?: string;
}

/**
 * Classify unrounded blink rate into half-open intervals [0,10), [10,20), [20,30), [30,40), [40,50), [50,inf).
 * Gate first: if eligible observation time < MIN_RELIABLE_OBSERVATION_MINUTES or coverage < 50%,
 * returns reliable: false and band: null.
 */
export function classifyBlinkRate(
  unroundedRate: number | null,
  observationSeconds: number,
  coveragePct = 100
): ClassificationResult {
  const observationMinutes = observationSeconds / 60;

  if (
    unroundedRate === null ||
    observationMinutes < OCURE_CONFIG.MIN_RELIABLE_OBSERVATION_MINUTES ||
    coveragePct < 50
  ) {
    return {
      reliable: false,
      band: null,
      unroundedRate,
      observationMinutes,
      coveragePct,
      statusLabel: 'insufficient reliable data',
    };
  }

  let band: BlinkRateBand;
  if (unroundedRate < 10) {
    band = '0_10';
  } else if (unroundedRate < 20) {
    band = '10_20';
  } else if (unroundedRate < 30) {
    band = '20_30';
  } else if (unroundedRate < 40) {
    band = '30_40';
  } else if (unroundedRate < 50) {
    band = '40_50';
  } else {
    band = '50_plus';
  }

  let suggestionPrompt: string | undefined;
  let escalationNote: string | undefined;

  if (band === '0_10') {
    suggestionPrompt =
      'Your camera-estimated rate was below 10 per minute this session. Rates vary with the task. Would you like a short, gentle blink routine?';
  } else if (band === '40_50' || band === '50_plus') {
    escalationNote =
      'If you have persistent redness, blurry or watering eyes, light sensitivity, or pain, consider seeing an eye-care professional.';
  }

  return {
    reliable: true,
    band,
    unroundedRate,
    observationMinutes,
    coveragePct,
    statusLabel: `${Math.round(unroundedRate)}/min (band ${band.replace('_', '-')})`,
    suggestionPrompt,
    escalationNote,
  };
}

export interface RoutineSelectionInput {
  todayUsedRoutineIds: string[]; // Routines completed or manually started today
  todayOfferedRoutineIds?: string[]; // Routines offered today
  latestReliableBand: BlinkRateBand | null; // null if uncalibrated, insufficient data, or unreliable
  localDateOrdinal: number; // e.g. Day of year (1..366) or Math.floor(Date.now() / 86400000)
  yesterdayFirstOfferedRoutineId?: string | null;
  isFirstOfferOfDay?: boolean;
}

/**
 * Deterministic Routine Selector.
 * Pure function with zero side-effects; strictly unit-testable.
 */
export function selectNextRoutine(input: RoutineSelectionInput): RoutineRecord | null {
  const {
    todayUsedRoutineIds,
    todayOfferedRoutineIds = [],
    latestReliableBand,
    localDateOrdinal,
    yesterdayFirstOfferedRoutineId,
    isFirstOfferOfDay = false,
  } = input;

  // 1. Initial Candidate Pool = [R2, R3, R4, R5, R6]
  let pool: Array<'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'> = ['R2', 'R3', 'R4', 'R5', 'R6'];

  // 2. If latest reliable band is below 10, add R1 and place it first
  if (latestReliableBand === '0_10') {
    pool = ['R1', ...pool];
  }

  // 3. If latest reliable band is 30 or above (including 40+), remove R1 and R2
  if (
    latestReliableBand === '30_40' ||
    latestReliableBand === '40_50' ||
    latestReliableBand === '50_plus'
  ) {
    pool = pool.filter((id) => id !== 'R1' && id !== 'R2');
  }

  // 4. Remove routines already offered or started today
  const unavailableToday = new Set([...todayUsedRoutineIds, ...todayOfferedRoutineIds]);
  pool = pool.filter((id) => !unavailableToday.has(id));

  if (pool.length === 0) {
    return null;
  }

  // 5. If R1 is in the pool and band < 10, select R1
  if (latestReliableBand === '0_10' && pool.includes('R1')) {
    return ROUTINES['R1'] || null;
  }

  // 6. Otherwise rotate: fixed order [R2, R3, R4, R5, R6, R1], starting at index (dayOrdinal mod 6)
  const rotationOrder: Array<'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'> = [
    'R2',
    'R3',
    'R4',
    'R5',
    'R6',
    'R1',
  ];
  const startIndex = Math.abs(localDateOrdinal) % rotationOrder.length;
  const cyclicCandidates: Array<'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'> = [];

  for (let i = 0; i < rotationOrder.length; i++) {
    const candidateId = rotationOrder[(startIndex + i) % rotationOrder.length];
    if (pool.includes(candidateId)) {
      cyclicCandidates.push(candidateId);
    }
  }

  if (cyclicCandidates.length === 0) {
    return null;
  }

  let selectedId = cyclicCandidates[0];

  // 7. For the day's first offer, if result equals yesterday's first offer and another candidate exists, take the next candidate
  if (
    isFirstOfferOfDay &&
    yesterdayFirstOfferedRoutineId &&
    selectedId === yesterdayFirstOfferedRoutineId &&
    cyclicCandidates.length > 1
  ) {
    selectedId = cyclicCandidates[1];
  }

  return ROUTINES[selectedId] || null;
}

export interface PlanOfferRecord {
  id: string;
  localDate: string; // YYYY-MM-DD
  slotIndex: number;
  routineId: string;
  offeredAt: number;
  outcome: 'accepted' | 'snoozed_then_accepted' | 'declined' | 'expired';
  sessionId?: string | null;
}

export interface ExerciseSessionRecord {
  id: string;
  routineId: string;
  bandId: BlinkRateBand | null;
  trigger: 'plan_accepted' | 'user_started' | 'suggestion_accepted';
  startedAt: number;
  endedAt: number;
  status: 'completed' | 'stopped_early';
  perStepStatus: Array<{
    stepIndex: number;
    status: 'finished' | 'skipped';
    cameraCheck?: CameraCheckStatus;
    checkPauseCount?: number;
    reminderCount?: number;
    promptCount?: number;
    completedCycles?: number;
  }>;
  checkPauseCount?: number;
  reminderCount?: number;
  elapsedSeconds: number;
  planOfferId?: string | null;
}

export interface DailyPlanState {
  dateKey: string; // YYYY-MM-DD in local timezone
  quota: number; // 3..5 (default 5)
  completedRoutineIds: string[];
  usedRoutineIds?: string[]; // Routines manually started or completed today
  completedSessionIds: string[]; // Prevents duplicate counting of the same session
  completedBreakCount: number; // 0..5 authoritative count of verified completed breaks today
  offeredRoutineIds: string[];
  firstOfferedRoutineId?: string | null;
  snoozedUntilTimestamp?: number | null;
  snoozeCount: number; // Max 1 snooze per offer
  activeMonitoredSecondsSinceLastEvent: number;
  lastEventTimestamp: number;
}

const DAILY_PLAN_KEY = 'iris_ocure_daily_plan_v1';
const PLAN_OFFERS_KEY = 'iris_ocure_plan_offers_v1';
const EXERCISE_SESSIONS_KEY = 'iris_ocure_exercise_sessions_v1';
const QUOTA_KEY = 'iris_ocure_quota_pref_v1';

export function getTodayDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getLocalDateOrdinal(d = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff =
    d.getTime() -
    start.getTime() +
    (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Daily Plan Store with Local Storage persistence, 3-5 quota support (default 5),
 * manual-start tracking, idempotency protection, and local midnight rollover.
 */
export class OcureDailyPlanService {
  public static getStoredQuota(): number {
    try {
      const raw = localStorage.getItem(QUOTA_KEY);
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (!Number.isNaN(parsed)) {
          return Math.min(OCURE_CONFIG.MAX_QUOTA, Math.max(OCURE_CONFIG.MIN_QUOTA, parsed));
        }
      }
    } catch {
      // Safe ignore
    }
    return OCURE_CONFIG.DEFAULT_DAILY_QUOTA;
  }

  public static setStoredQuota(quota: number, now = new Date()): void {
    try {
      const clamped = Math.min(
        OCURE_CONFIG.MAX_QUOTA,
        Math.max(OCURE_CONFIG.MIN_QUOTA, Math.round(quota))
      );
      localStorage.setItem(QUOTA_KEY, String(clamped));
      const current = this.getDailyPlan(now);
      current.quota = clamped;
      this.saveDailyPlan(current);
    } catch {
      // Safe ignore
    }
  }

  public static getDailyPlan(now = new Date()): DailyPlanState {
    const today = getTodayDateKey(now);
    const storedQuota = this.getStoredQuota();
    try {
      const raw = localStorage.getItem(DAILY_PLAN_KEY);
      if (raw) {
        const parsed: Partial<DailyPlanState> = JSON.parse(raw);
        if (parsed && parsed.dateKey === today) {
          const completedRoutineIds = Array.isArray(parsed.completedRoutineIds)
            ? parsed.completedRoutineIds
            : [];
          const usedRoutineIds = Array.isArray(parsed.usedRoutineIds)
            ? Array.from(new Set([...parsed.usedRoutineIds, ...completedRoutineIds]))
            : [...completedRoutineIds];
          const completedSessionIds = Array.isArray(parsed.completedSessionIds)
            ? parsed.completedSessionIds
            : [];
          const rawCount =
            typeof parsed.completedBreakCount === 'number'
              ? parsed.completedBreakCount
              : Math.max(completedSessionIds.length, completedRoutineIds.length);
          const completedBreakCount = Math.min(
            OCURE_CONFIG.MAX_DAILY_BREAKS,
            Math.max(0, rawCount)
          );
          const quota =
            typeof parsed.quota === 'number'
              ? Math.min(OCURE_CONFIG.MAX_QUOTA, Math.max(OCURE_CONFIG.MIN_QUOTA, parsed.quota))
              : storedQuota;

          return {
            dateKey: today,
            quota,
            completedRoutineIds,
            usedRoutineIds,
            completedSessionIds,
            completedBreakCount,
            offeredRoutineIds: Array.isArray(parsed.offeredRoutineIds)
              ? parsed.offeredRoutineIds
              : [],
            firstOfferedRoutineId: parsed.firstOfferedRoutineId ?? null,
            snoozedUntilTimestamp: parsed.snoozedUntilTimestamp ?? null,
            snoozeCount: typeof parsed.snoozeCount === 'number' ? parsed.snoozeCount : 0,
            activeMonitoredSecondsSinceLastEvent:
              typeof parsed.activeMonitoredSecondsSinceLastEvent === 'number'
                ? parsed.activeMonitoredSecondsSinceLastEvent
                : 0,
            lastEventTimestamp:
              typeof parsed.lastEventTimestamp === 'number'
                ? parsed.lastEventTimestamp
                : now.getTime(),
          };
        }
      }
    } catch {
      // ignore
    }

    const newPlan: DailyPlanState = {
      dateKey: today,
      quota: storedQuota,
      completedRoutineIds: [],
      usedRoutineIds: [],
      completedSessionIds: [],
      completedBreakCount: 0,
      offeredRoutineIds: [],
      firstOfferedRoutineId: null,
      snoozedUntilTimestamp: null,
      snoozeCount: 0,
      activeMonitoredSecondsSinceLastEvent: 0,
      lastEventTimestamp: now.getTime(),
    };
    this.saveDailyPlan(newPlan);
    return newPlan;
  }

  public static saveDailyPlan(plan: DailyPlanState): void {
    try {
      localStorage.setItem(DAILY_PLAN_KEY, JSON.stringify(plan));
    } catch {
      // safe ignore
    }
  }

  public static getCompletedBreaksTodayCount(now = new Date()): number {
    const plan = this.getDailyPlan(now);
    return Math.min(OCURE_CONFIG.MAX_DAILY_BREAKS, Math.max(0, plan.completedBreakCount));
  }

  public static canStartBreakToday(now = new Date()): boolean {
    return this.getCompletedBreaksTodayCount(now) < OCURE_CONFIG.MAX_DAILY_BREAKS;
  }

  public static recordManualStart(routineId: string, now = new Date()): void {
    const plan = this.getDailyPlan(now);
    const used = Array.isArray(plan.usedRoutineIds)
      ? [...plan.usedRoutineIds]
      : [...plan.completedRoutineIds];
    if (!used.includes(routineId)) {
      used.push(routineId);
    }
    plan.usedRoutineIds = used;
    this.saveDailyPlan(plan);
  }

  public static evaluateScheduledOffer(params: {
    isMonitoring: boolean;
    cameraStatus: string;
    activeMonitoredSeconds?: number | null;
    latestReliableBand: BlinkRateBand | null;
    isSessionActive?: boolean;
    hasPendingOffer?: boolean;
    yesterdayFirstOfferedRoutineId?: string | null;
    now?: Date;
  }): {
    shouldOffer: boolean;
    routine: RoutineRecord | null;
    reason?: string;
  } {
    const now = params.now || new Date();
    if (
      !params.isMonitoring ||
      (params.cameraStatus !== 'active' && params.cameraStatus !== 'running') ||
      params.activeMonitoredSeconds === null ||
      params.activeMonitoredSeconds === undefined ||
      Number.isNaN(params.activeMonitoredSeconds)
    ) {
      return { shouldOffer: false, routine: null, reason: 'monitoring_or_active_time_unknown' };
    }

    if (params.isSessionActive || params.hasPendingOffer) {
      return { shouldOffer: false, routine: null, reason: 'session_or_offer_active' };
    }

    const plan = this.getDailyPlan(now);
    if (
      plan.offeredRoutineIds.length >= plan.quota ||
      plan.completedBreakCount >= OCURE_CONFIG.MAX_DAILY_BREAKS
    ) {
      return { shouldOffer: false, routine: null, reason: 'quota_reached' };
    }

    if (plan.snoozedUntilTimestamp && now.getTime() < plan.snoozedUntilTimestamp) {
      return { shouldOffer: false, routine: null, reason: 'snoozed' };
    }

    const activeSeconds = params.activeMonitoredSeconds ?? plan.activeMonitoredSecondsSinceLastEvent;
    if (activeSeconds < OCURE_CONFIG.MIN_ACTIVE_MINUTES_BETWEEN_OFFERS * 60) {
      return { shouldOffer: false, routine: null, reason: 'insufficient_active_time' };
    }

    const usedToday = Array.from(
      new Set([...plan.completedRoutineIds, ...(plan.usedRoutineIds || [])])
    );
    const routine = selectNextRoutine({
      todayUsedRoutineIds: usedToday,
      todayOfferedRoutineIds: plan.offeredRoutineIds,
      latestReliableBand: params.latestReliableBand,
      localDateOrdinal: getLocalDateOrdinal(now),
      yesterdayFirstOfferedRoutineId: params.yesterdayFirstOfferedRoutineId ?? null,
      isFirstOfferOfDay: plan.offeredRoutineIds.length === 0,
    });

    if (!routine) {
      return { shouldOffer: false, routine: null, reason: 'pool_exhausted' };
    }

    return { shouldOffer: true, routine };
  }

  public static recordSessionCompleted(
    routineId: string,
    elapsedSeconds: number,
    sessionId?: string,
    now = new Date()
  ): {
    recorded: boolean;
    reason?: 'daily_limit_reached' | 'duplicate_session' | 'incomplete_session';
    completedCount: number;
  } {
    const plan = this.getDailyPlan(now);

    if (elapsedSeconds < 120) {
      return {
        recorded: false,
        reason: 'incomplete_session',
        completedCount: plan.completedBreakCount,
      };
    }

    if (sessionId && plan.completedSessionIds.includes(sessionId)) {
      return {
        recorded: false,
        reason: 'duplicate_session',
        completedCount: plan.completedBreakCount,
      };
    }

    if (plan.completedBreakCount >= OCURE_CONFIG.MAX_DAILY_BREAKS) {
      return {
        recorded: false,
        reason: 'daily_limit_reached',
        completedCount: plan.completedBreakCount,
      };
    }

    if (sessionId) {
      plan.completedSessionIds.push(sessionId);
    }
    if (!plan.completedRoutineIds.includes(routineId)) {
      plan.completedRoutineIds.push(routineId);
    }
    const used = Array.isArray(plan.usedRoutineIds)
      ? [...plan.usedRoutineIds]
      : [...plan.completedRoutineIds];
    if (!used.includes(routineId)) {
      used.push(routineId);
    }
    plan.usedRoutineIds = used;
    plan.completedBreakCount = Math.min(
      OCURE_CONFIG.MAX_DAILY_BREAKS,
      plan.completedBreakCount + 1
    );
    plan.activeMonitoredSecondsSinceLastEvent = 0;
    plan.lastEventTimestamp = now.getTime();
    plan.snoozedUntilTimestamp = null;
    plan.snoozeCount = 0;
    this.saveDailyPlan(plan);

    return {
      recorded: true,
      completedCount: plan.completedBreakCount,
    };
  }

  public static recordOfferOutcome(
    routineId: string,
    outcome: 'accepted' | 'snoozed_then_accepted' | 'declined' | 'expired',
    sessionId?: string,
    now = new Date()
  ): void {
    const plan = this.getDailyPlan(now);
    if (!plan.offeredRoutineIds.includes(routineId)) {
      plan.offeredRoutineIds.push(routineId);
      if (!plan.firstOfferedRoutineId) {
        plan.firstOfferedRoutineId = routineId;
      }
    }

    plan.activeMonitoredSecondsSinceLastEvent = 0;
    plan.snoozedUntilTimestamp = null;
    plan.snoozeCount = 0;
    plan.lastEventTimestamp = now.getTime();
    this.saveDailyPlan(plan);

    const offerRecord: PlanOfferRecord = {
      id: `offer-${now.getTime()}`,
      localDate: plan.dateKey,
      slotIndex: plan.offeredRoutineIds.length,
      routineId,
      offeredAt: now.getTime(),
      outcome,
      sessionId,
    };
    this.appendPlanOffer(offerRecord);
  }

  public static snoozeOffer(now = new Date()): boolean {
    const plan = this.getDailyPlan(now);
    if (plan.snoozeCount >= 1) {
      return false;
    }
    plan.snoozeCount += 1;
    plan.snoozedUntilTimestamp = now.getTime() + OCURE_CONFIG.SNOOZE_MINUTES * 60 * 1000;
    this.saveDailyPlan(plan);
    return true;
  }

  public static addActiveMonitoredSeconds(seconds: number, now = new Date()): void {
    if (seconds <= 0) return;
    const plan = this.getDailyPlan(now);
    plan.activeMonitoredSecondsSinceLastEvent += seconds;
    this.saveDailyPlan(plan);
  }

  public static getExerciseSessions(): ExerciseSessionRecord[] {
    try {
      const raw = localStorage.getItem(EXERCISE_SESSIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cutoff = Date.now() - OCURE_CONFIG.RETENTION_DAYS * 86400000;
          return parsed.filter((r) => r.startedAt >= cutoff);
        }
      }
    } catch {
      // fallback
    }
    return [];
  }

  public static appendExerciseSession(record: ExerciseSessionRecord): void {
    try {
      const list = this.getExerciseSessions();
      if (list.some((r) => r.id === record.id)) {
        return;
      }
      list.unshift(record);
      const cutoff = Date.now() - OCURE_CONFIG.RETENTION_DAYS * 86400000;
      const pruned = list.filter((r) => r.startedAt >= cutoff).slice(0, 500);
      localStorage.setItem(EXERCISE_SESSIONS_KEY, JSON.stringify(pruned));
    } catch {
      // ignore
    }
  }

  public static getPlanOffers(): PlanOfferRecord[] {
    try {
      const raw = localStorage.getItem(PLAN_OFFERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cutoff = Date.now() - OCURE_CONFIG.RETENTION_DAYS * 86400000;
          return parsed.filter((r) => r.offeredAt >= cutoff);
        }
      }
    } catch {
      // fallback
    }
    return [];
  }

  public static appendPlanOffer(record: PlanOfferRecord): void {
    try {
      const list = this.getPlanOffers();
      list.unshift(record);
      const cutoff = Date.now() - OCURE_CONFIG.RETENTION_DAYS * 86400000;
      const pruned = list.filter((r) => r.offeredAt >= cutoff).slice(0, 500);
      localStorage.setItem(PLAN_OFFERS_KEY, JSON.stringify(pruned));
    } catch {
      // ignore
    }
  }
}
