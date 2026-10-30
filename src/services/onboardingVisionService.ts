import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { CalibrationData, OnboardingStep } from '../types';
import { DistanceEstimator } from './distanceEstimator';
import { CameraService } from './cameraService';
import { computeBlinkThresholds, DEFAULT_BLINK_CONFIG } from './blinkDetector';

export const ONBOARDING_SETUP_STORAGE_KEY = 'iris_onboarding_setup_v3';
export const CALIBRATION_SCHEMA_VERSION = 2;

/**
 * Named constants for the guided 5-step Face ID-style camera calibration.
 */
export const GUIDED_STEP_HOLD_DURATION_MS = 320;
export const LOOK_STRAIGHT_HOLD_DURATION_MS = 420;
export const CLOSE_EYES_HOLD_DURATION_MS = 260;
export const GUIDED_NEUTRAL_RETURN_MS = 120;
export const STEP_TIMEOUT_MS = 9000;
export const COMPLETION_ANIMATION_DURATION_MS = 1150;
export const ENABLE_REAL_LANDMARK_MESH = true;

export const GUIDED_FIT_MIN_X = 0.24;
export const GUIDED_FIT_MAX_X = 0.76;
export const GUIDED_FIT_MIN_Y = 0.18;
export const GUIDED_FIT_MAX_Y = 0.82;
export const GUIDED_MIN_FACE_WIDTH = 0.13;
export const GUIDED_MAX_FACE_WIDTH = 0.65;

export const GUIDED_NEUTRAL_YAW_MAX_DEG = 11;
export const GUIDED_NEUTRAL_PITCH_MAX_DEG = 13;
export const GUIDED_NEUTRAL_RETURN_YAW_DEG = 9;
export const GUIDED_YAW_TURN_MIN_DEG = 12;
export const GUIDED_YAW_TURN_OFFSET_RATIO = 0.17;
export const MIN_TRACKING_CONFIDENCE = 0.45;

// Legacy compatibility constants
export const FACE_ID_TICK_COUNT = 64;
export const FACE_ID_SECTOR_COUNT = 8;
export const MIN_STABLE_FRAMES_PER_SECTOR = 3;
export const MIN_SECTOR_FRAME_INTERVAL_MS = 24;
export const MIN_HEAD_TILT_MAGNITUDE = 0.032;

export interface Point2D {
  x: number;
  y: number;
}

export interface NormalizedFaceBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export type GuidedFaceStepId =
  | 'fit'
  | 'look_straight'
  | 'close_eyes'
  | 'turn_left'
  | 'turn_right';

export type GuidedFailureReason =
  | 'none'
  | 'no_face'
  | 'low_light'
  | 'face_size'
  | 'off_center'
  | 'angle_too_small'
  | 'eyes_not_closed'
  | 'needs_neutral';

export interface ExtractedFaceGeometry {
  rawBox: NormalizedFaceBox;
  rawFaceCenter: Point2D;
  previewLeftEye: Point2D;
  previewRightEye: Point2D;
  leftEyeWidth: number;
  rightEyeWidth: number;
  leftEyeEAR: number;
  rightEyeEAR: number;
  combinedEAR: number;
  bothEyesValid: boolean;
  interOcular: number;
  /**
   * Mirrored nose horizontal offset relative to face half-width:
   * - Negative (< 0): user turned head to their own physical LEFT (moves left in mirrored preview)
   * - Positive (> 0): user turned head to their own physical RIGHT (moves right in mirrored preview)
   */
  userYawOffsetRatio: number;
  /**
   * User-centric yaw in degrees:
   * - Negative (< 0): user turned head to their own physical LEFT
   * - Positive (> 0): user turned head to their own physical RIGHT
   */
  userYawDeg: number;
  pitchRatio: number;
  headPose: { yaw: number; pitch: number; roll: number };
  meshPoints: Point2D[];
}

export interface GuidedStepPredicateContext {
  geom: ExtractedFaceGeometry;
  baselineEAR: number;
  closureThresholdEAR: number;
  reopenThresholdEAR: number;
  priorOpenEyesConfirmed: boolean;
  neutralReturnConfirmed: boolean;
}

export interface GuidedStepPredicateResult {
  passed: boolean;
  feedbackHint: string | null;
  failureReason: GuidedFailureReason;
}

export interface GuidedFaceStepConfig {
  id: GuidedFaceStepId;
  instruction: string;
  helperText: string;
  holdDurationMs: number;
  timeoutMs: number;
  requiresNeutralBeforeStart: boolean;
  predicate: (ctx: GuidedStepPredicateContext) => GuidedStepPredicateResult;
}

/**
 * Declarative configuration array defining the 5 guided Face ID-style calibration steps.
 * Steps can be added or removed from this array without modifying the evaluator state machine.
 */
export const GUIDED_FACE_CHECK_STEPS: GuidedFaceStepConfig[] = [
  {
    id: 'fit',
    instruction: 'Fit your face in the frame',
    helperText: 'Center your face inside the corner brackets at a comfortable viewing distance.',
    holdDurationMs: GUIDED_STEP_HOLD_DURATION_MS,
    timeoutMs: STEP_TIMEOUT_MS,
    requiresNeutralBeforeStart: false,
    predicate: ({ geom }) => {
      const { rawBox, bothEyesValid } = geom;
      const clipped =
        rawBox.minX < 0.04 ||
        rawBox.maxX > 0.96 ||
        rawBox.minY < 0.04 ||
        rawBox.maxY > 0.96;

      if (rawBox.width < GUIDED_MIN_FACE_WIDTH) {
        return {
          passed: false,
          feedbackHint: 'Move closer',
          failureReason: 'face_size',
        };
      }
      if (rawBox.width > GUIDED_MAX_FACE_WIDTH) {
        return {
          passed: false,
          feedbackHint: 'Move back',
          failureReason: 'face_size',
        };
      }
      if (
        clipped ||
        rawBox.centerX < GUIDED_FIT_MIN_X ||
        rawBox.centerX > GUIDED_FIT_MAX_X ||
        rawBox.centerY < GUIDED_FIT_MIN_Y ||
        rawBox.centerY > GUIDED_FIT_MAX_Y ||
        !bothEyesValid
      ) {
        return {
          passed: false,
          feedbackHint: 'Center your face',
          failureReason: 'off_center',
        };
      }
      return {
        passed: true,
        feedbackHint: 'Hold steady…',
        failureReason: 'none',
      };
    },
  },
  {
    id: 'look_straight',
    instruction: 'Look straight at the screen and hold still',
    helperText: 'Measuring your natural open-eye baseline and viewing distance.',
    holdDurationMs: LOOK_STRAIGHT_HOLD_DURATION_MS,
    timeoutMs: STEP_TIMEOUT_MS,
    requiresNeutralBeforeStart: false,
    predicate: ({ geom }) => {
      const { rawBox, bothEyesValid, userYawDeg, headPose, combinedEAR } = geom;
      const insideFrame =
        rawBox.centerX >= GUIDED_FIT_MIN_X &&
        rawBox.centerX <= GUIDED_FIT_MAX_X &&
        rawBox.centerY >= GUIDED_FIT_MIN_Y &&
        rawBox.centerY <= GUIDED_FIT_MAX_Y &&
        rawBox.width >= GUIDED_MIN_FACE_WIDTH &&
        rawBox.width <= GUIDED_MAX_FACE_WIDTH;

      if (!insideFrame) {
        return {
          passed: false,
          feedbackHint:
            rawBox.width < GUIDED_MIN_FACE_WIDTH
              ? 'Move closer'
              : rawBox.width > GUIDED_MAX_FACE_WIDTH
              ? 'Move back'
              : 'Center your face',
          failureReason: 'off_center',
        };
      }

      if (!bothEyesValid || combinedEAR < DEFAULT_BLINK_CONFIG.minBaselineEAR) {
        return {
          passed: false,
          feedbackHint: 'Keep both eyes naturally open',
          failureReason: 'off_center',
        };
      }

      const yawNeutral = Math.abs(userYawDeg) <= GUIDED_NEUTRAL_YAW_MAX_DEG;
      const pitchNeutral = Math.abs(headPose.pitch) <= GUIDED_NEUTRAL_PITCH_MAX_DEG;

      if (!yawNeutral || !pitchNeutral) {
        return {
          passed: false,
          feedbackHint: 'Look straight ahead at the center of your screen',
          failureReason: 'angle_too_small',
        };
      }

      return {
        passed: true,
        feedbackHint: 'Capturing open-eye baseline…',
        failureReason: 'none',
      };
    },
  },
  {
    id: 'close_eyes',
    instruction: 'Close your eyes',
    helperText: 'Gently close both eyes for a moment so IRIS can verify eyelid closure.',
    holdDurationMs: CLOSE_EYES_HOLD_DURATION_MS,
    timeoutMs: STEP_TIMEOUT_MS,
    requiresNeutralBeforeStart: false,
    predicate: ({
      geom,
      closureThresholdEAR,
      priorOpenEyesConfirmed,
    }) => {
      const { rawBox, leftEyeWidth, rightEyeWidth, combinedEAR } = geom;
      const faceTrackedInFrame =
        rawBox.centerX >= 0.20 &&
        rawBox.centerX <= 0.80 &&
        rawBox.centerY >= 0.14 &&
        rawBox.centerY <= 0.86 &&
        leftEyeWidth >= 0.013 &&
        rightEyeWidth >= 0.013 &&
        combinedEAR > 0.01;

      if (!faceTrackedInFrame) {
        return {
          passed: false,
          feedbackHint: 'Center your face so both eyes are tracked',
          failureReason: 'off_center',
        };
      }

      if (!priorOpenEyesConfirmed) {
        return {
          passed: false,
          feedbackHint: 'Open your eyes normally first, then close them',
          failureReason: 'eyes_not_closed',
        };
      }

      if (combinedEAR <= closureThresholdEAR) {
        return {
          passed: true,
          feedbackHint: 'Hold eyes closed briefly…',
          failureReason: 'none',
        };
      }

      return {
        passed: false,
        feedbackHint: 'Close both eyes gently while keeping your head still',
        failureReason: 'eyes_not_closed',
      };
    },
  },
  {
    id: 'turn_left',
    instruction: 'Turn your head left',
    helperText: 'Slowly turn your head slightly to your left while staying in the frame.',
    holdDurationMs: GUIDED_STEP_HOLD_DURATION_MS,
    timeoutMs: STEP_TIMEOUT_MS,
    requiresNeutralBeforeStart: true,
    predicate: ({ geom, neutralReturnConfirmed }) => {
      const { rawBox, userYawDeg, userYawOffsetRatio } = geom;
      const inBounds =
        rawBox.minX >= 0.02 &&
        rawBox.maxX <= 0.98 &&
        rawBox.width >= GUIDED_MIN_FACE_WIDTH * 0.85;

      if (!inBounds) {
        return {
          passed: false,
          feedbackHint: 'Keep your face inside the frame',
          failureReason: 'off_center',
        };
      }

      if (!neutralReturnConfirmed) {
        return {
          passed: false,
          feedbackHint: 'Look straight ahead briefly before turning left',
          failureReason: 'needs_neutral',
        };
      }

      // User's physical left = negative userYawDeg / negative mirrored nose offset
      if (
        userYawDeg <= -GUIDED_YAW_TURN_MIN_DEG ||
        userYawOffsetRatio <= -GUIDED_YAW_TURN_OFFSET_RATIO
      ) {
        return {
          passed: true,
          feedbackHint: 'Hold left turn briefly…',
          failureReason: 'none',
        };
      }

      if (userYawDeg >= GUIDED_YAW_TURN_MIN_DEG * 0.7) {
        return {
          passed: false,
          feedbackHint: 'That is right — turn toward your left side instead',
          failureReason: 'angle_too_small',
        };
      }

      return {
        passed: false,
        feedbackHint: 'Turn your head slightly farther to your left',
        failureReason: 'angle_too_small',
      };
    },
  },
  {
    id: 'turn_right',
    instruction: 'Turn your head right',
    helperText: 'Return to center, then slowly turn your head slightly to your right.',
    holdDurationMs: GUIDED_STEP_HOLD_DURATION_MS,
    timeoutMs: STEP_TIMEOUT_MS,
    requiresNeutralBeforeStart: true,
    predicate: ({ geom, neutralReturnConfirmed }) => {
      const { rawBox, userYawDeg, userYawOffsetRatio } = geom;
      const inBounds =
        rawBox.minX >= 0.02 &&
        rawBox.maxX <= 0.98 &&
        rawBox.width >= GUIDED_MIN_FACE_WIDTH * 0.85;

      if (!inBounds) {
        return {
          passed: false,
          feedbackHint: 'Keep your face inside the frame',
          failureReason: 'off_center',
        };
      }

      if (!neutralReturnConfirmed) {
        return {
          passed: false,
          feedbackHint: 'Return your head to center first, then turn right',
          failureReason: 'needs_neutral',
        };
      }

      // User's physical right = positive userYawDeg / positive mirrored nose offset
      if (
        userYawDeg >= GUIDED_YAW_TURN_MIN_DEG ||
        userYawOffsetRatio >= GUIDED_YAW_TURN_OFFSET_RATIO
      ) {
        return {
          passed: true,
          feedbackHint: 'Hold right turn briefly…',
          failureReason: 'none',
        };
      }

      if (userYawDeg <= -GUIDED_YAW_TURN_MIN_DEG * 0.7) {
        return {
          passed: false,
          feedbackHint: 'That is left — turn toward your right side instead',
          failureReason: 'angle_too_small',
        };
      }

      return {
        passed: false,
        feedbackHint: 'Turn your head slightly farther to your right',
        failureReason: 'angle_too_small',
      };
    },
  },
];

export type TruthfulDetectionState =
  | 'Initializing camera'
  | 'Loading face detection'
  | 'Looking for your face'
  | 'Face detected'
  | 'Position your face'
  | 'Hold still'
  | 'Ready'
  | 'Camera or detection error';

export type VisionPipelineStatus =
  | 'initializing_camera'
  | 'loading_detector'
  | 'ready'
  | 'error';

export interface FacePositioningEvaluation {
  faceDetected: boolean;
  landmarksValid: boolean;
  bothEyesValid: boolean;
  isLiveFrame: boolean;
  faceInsideGuide: boolean;
  detectionStable: boolean;
  stabilityProgressPct: number;
  stableDurationMs: number;
  canContinueFromFacePositioning: boolean;
  detectionState: TruthfulDetectionState;
  uiState:
    | 'initializing_camera'
    | 'loading_detector'
    | 'searching'
    | 'face_detected'
    | 'aligning'
    | 'hold_still'
    | 'aligned'
    | 'detected_not_aligned'
    | 'error';
  instruction: string;
  helperText: string;
  guideLabel: string;
  faceBox: NormalizedFaceBox | null;
  faceCenter: Point2D | null;
  silhouettePoints: Point2D[] | null;
  meshPoints: Point2D[] | null;
  leftEye: Point2D | null;
  rightEye: Point2D | null;
  eyeMidpoint: Point2D | null;
  eyeLevelY: number | null;
  headPose: { yaw: number; pitch: number; roll: number };
  currentEyeEAR: number;
  closureThresholdEAR: number;
  // Guided multi-step state
  currentStepIndex: number;
  totalSteps: number;
  currentStepId: GuidedFaceStepId | 'completed';
  completedStepIds: GuidedFaceStepId[];
  stepSatisfied: boolean;
  stepHoldProgressPct: number;
  stepTimedOut: boolean;
  timeoutDiagnostic: string | null;
  calibrationSkipped: boolean;
  // Legacy compatibility fields
  filledTicks: boolean[];
  sectorFrameCounts: number[];
  completedSectors: number;
  totalSectors: number;
  activeSector: number | null;
  calibrationProgressPct: number;
  savedMetadata: PersistedCalibrationMetadata | null;
}

export interface EyeAlignmentEvaluation {
  faceDetected: boolean;
  bothEyesDetected: boolean;
  bothEyesReliable: boolean;
  eyeMidpointInsideArea: boolean;
  headRotationValid: boolean;
  eyeLevelAligned: boolean;
  eyeDetectionStable: boolean;
  stabilityProgressPct: number;
  stableDurationMs: number;
  canContinueFromEyeAlignment: boolean;
  detectionState: TruthfulDetectionState;
  instruction:
    | 'Initializing camera…'
    | 'Loading face detection…'
    | 'Looking for your face…'
    | 'Face detected'
    | 'Position your face'
    | 'Raise the camera slightly'
    | 'Lower the camera slightly'
    | 'Center your face'
    | 'Keep both eyes visible'
    | 'Hold still'
    | 'Hold still for a moment'
    | 'Ready'
    | 'Both eyes detected'
    | 'Camera or detection error';
  secondaryStatus: string | null;
  faceBox: NormalizedFaceBox | null;
  silhouettePoints: Point2D[] | null;
  leftEye: Point2D | null;
  rightEye: Point2D | null;
  eyeMidpoint: Point2D | null;
  eyeLevelY: number | null;
  headPose: { yaw: number; pitch: number; roll: number };
  leftEyeEAR: number;
  rightEyeEAR: number;
  filledTicks: boolean[];
}

export type CalibrationPhaseStatus =
  | 'Checking camera'
  | 'Confirming face and eye alignment'
  | 'Collecting reference measurements'
  | 'Saving calibration'
  | 'Calibration saved'
  | 'Calibration failed';

export interface CalibrationProgressState {
  phase: CalibrationPhaseStatus;
  progressPct: number;
  samplesCollected: number;
  requiredSamples: number;
  calibrationSucceeded: boolean;
  calibrationSaved: boolean;
  canFinishCalibration: boolean;
  errorExplanation: string | null;
  savedMetadata: PersistedCalibrationMetadata | null;
  filledTicks: boolean[];
}

export interface PersistedCalibrationMetadata {
  calibrationVersion: number;
  timestamp: number;
  normalizedFacePosition: { x: number; y: number };
  normalizedFaceWidth: number;
  interOcularDistance: number;
  eyeLevelY: number;
  baselineEAR: number;
  relativeDistanceBaseline: number;
  calibrationValid: boolean;
}

export interface PersistedOnboardingRecord {
  version: number;
  privacyAcknowledged: boolean;
  privacyAcknowledgedAt: number;
  cameraPermissionGranted: boolean;
  calibrationSaved: boolean;
  calibratedAt: number;
  setupCompleted: boolean;
  completedAt: number;
  calibrationMetadata: PersistedCalibrationMetadata | null;
}

export interface OnboardingVisionConfig {
  requiredStabilityMs: number;
  minConfidence: number;
  mirrorPreview: boolean;
  requiredCalibrationSamples: number;
  guideMinX: number;
  guideMaxX: number;
  guideMinY: number;
  guideMaxY: number;
  minFaceWidth: number;
  maxFaceWidth: number;
  eyeLevelMinY: number;
  eyeLevelMaxY: number;
}

export const DEFAULT_ONBOARDING_VISION_CONFIG: OnboardingVisionConfig = {
  requiredStabilityMs: GUIDED_STEP_HOLD_DURATION_MS,
  minConfidence: MIN_TRACKING_CONFIDENCE,
  mirrorPreview: true,
  requiredCalibrationSamples: 16,
  guideMinX: GUIDED_FIT_MIN_X,
  guideMaxX: GUIDED_FIT_MAX_X,
  guideMinY: GUIDED_FIT_MIN_Y,
  guideMaxY: GUIDED_FIT_MAX_Y,
  minFaceWidth: GUIDED_MIN_FACE_WIDTH,
  maxFaceWidth: GUIDED_MAX_FACE_WIDTH,
  eyeLevelMinY: 0.20,
  eyeLevelMaxY: 0.72,
};

// Curated anatomical Face Mesh indices for the thin, low-opacity real landmark mesh
const REAL_MESH_LANDMARK_INDICES = [
  // Outer face oval
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
  // Left & right eyebrows
  70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
  // Left & right eye contours
  33, 160, 159, 158, 133, 153, 145, 144, 362, 385, 386, 387, 263, 373, 374, 380,
  // Nose bridge & tip
  168, 6, 197, 195, 5, 4, 1, 98, 327,
  // Lips outer contour
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
];

function dist2D(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isValidLandmark(lm: NormalizedLandmark | undefined): lm is NormalizedLandmark {
  if (!lm) return false;
  return (
    Number.isFinite(lm.x) &&
    Number.isFinite(lm.y) &&
    lm.x >= -0.05 &&
    lm.x <= 1.05 &&
    lm.y >= -0.05 &&
    lm.y <= 1.05
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildFilledTicksFromSectors(
  sectorFrameCounts: number[],
  totalTicks = FACE_ID_TICK_COUNT,
  sectorCount = FACE_ID_SECTOR_COUNT,
  minFramesPerSector = MIN_STABLE_FRAMES_PER_SECTOR
): boolean[] {
  const ticksPerSector = Math.floor(totalTicks / sectorCount);
  const ticks = new Array<boolean>(totalTicks).fill(false);

  for (let s = 0; s < sectorCount; s++) {
    const count = Math.min(minFramesPerSector, Math.max(0, sectorFrameCounts[s] ?? 0));
    const filledInSector = Math.round((count / minFramesPerSector) * ticksPerSector);
    const startIdx = s * ticksPerSector;
    for (let i = 0; i < filledInSector && startIdx + i < totalTicks; i++) {
      ticks[startIdx + i] = true;
    }
  }

  return ticks;
}

/**
 * Maps a normalized point (0..1) from the intrinsic video frame into the
 * rendered preview container's coordinate space when CSS `object-cover` is applied.
 */
export function mapVideoPointToContainer(
  pt: Point2D,
  videoAspect: number,
  containerAspect: number
): Point2D {
  if (
    !Number.isFinite(videoAspect) ||
    !Number.isFinite(containerAspect) ||
    videoAspect <= 0 ||
    containerAspect <= 0 ||
    Math.abs(videoAspect - containerAspect) < 0.01
  ) {
    return pt;
  }

  if (containerAspect > videoAspect) {
    const visibleHeightRatio = videoAspect / containerAspect;
    return {
      x: pt.x,
      y: (pt.y - 0.5) / visibleHeightRatio + 0.5,
    };
  } else {
    const visibleWidthRatio = containerAspect / videoAspect;
    return {
      x: (pt.x - 0.5) / visibleWidthRatio + 0.5,
      y: pt.y,
    };
  }
}

/**
 * Validates that frames come from a live advancing video stream with decoded dimensions.
 */
export class LiveStreamFrameValidator {
  private lastVideoTime: number = -1;
  private lastChangeTimestamp: number = 0;
  private staleCount: number = 0;

  public validateVideoElement(video: HTMLVideoElement | null): boolean {
    if (!video) return false;
    if (
      video.ended ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return false;
    }
    const currentTime = video.currentTime;
    if (!Number.isFinite(currentTime)) {
      return false;
    }
    const now = performance.now();
    if (Math.abs(currentTime - this.lastVideoTime) > 0.0001) {
      this.lastVideoTime = currentTime;
      this.lastChangeTimestamp = now;
      this.staleCount = 0;
    } else {
      this.staleCount += 1;
      if (this.lastChangeTimestamp > 0 && now - this.lastChangeTimestamp > 4000) {
        return false;
      }
    }
    return true;
  }

  public validateSyntheticFrame(frameTimeSec: number): boolean {
    if (!Number.isFinite(frameTimeSec) || frameTimeSec <= 0) return false;
    if (Math.abs(frameTimeSec - this.lastVideoTime) < 0.0001) {
      this.staleCount += 1;
      if (this.staleCount > 4) {
        return false;
      }
    } else {
      this.staleCount = 0;
      this.lastVideoTime = frameTimeSec;
    }
    return true;
  }

  public reset(): void {
    this.lastVideoTime = -1;
    this.lastChangeTimestamp = 0;
    this.staleCount = 0;
  }
}

/**
 * Stateful computer-vision evaluator for the 5-step guided Face ID-style calibration
 * as well as Steps 5 and 6.
 */
export class OnboardingVisionEvaluator {
  private config: OnboardingVisionConfig;
  private stepsConfig: GuidedFaceStepConfig[];

  // Guided multi-step state machine
  private currentStepIndex: number = 0;
  private completedStepIds: GuidedFaceStepId[] = [];
  private currentStepHeldMs: number = 0;
  private currentStepElapsedMs: number = 0;
  private lastFaceTimestampMs: number | null = null;
  private priorOpenEyesConfirmed: boolean = false;
  private neutralReturnConfirmed: boolean = false;
  private neutralHoldMs: number = 0;
  private lastFailureReason: GuidedFailureReason = 'none';
  private calibrationSkipped: boolean = false;

  // Open-eye baseline samples captured during Step 2 ('look_straight')
  private lookStraightSamples: Array<{
    centerX: number;
    centerY: number;
    faceWidth: number;
    interOcular: number;
    eyeLevelY: number;
    ear: number;
  }> = [];
  private calibratedBaselineEAR: number = DEFAULT_BLINK_CONFIG.defaultBaselineEAR;
  private pendingCalibrationMetadata: PersistedCalibrationMetadata | null = null;
  private faceCalibrationSaved: boolean = false;

  // Consecutive-frame confirmation counters
  private consecutiveDetectedFrames: number = 0;
  private consecutiveMissedFrames: number = 0;
  private lastValidEvaluation: FacePositioningEvaluation | null = null;
  private lastValidEyeEvaluation: EyeAlignmentEvaluation | null = null;
  private eyeStableMs: number = 0;
  private lastEyeTimestampMs: number | null = null;
  private calibrationMissedFrames: number = 0;

  // Smoothed visual coordinates for jitter-free rendering
  private smoothedBox: NormalizedFaceBox | null = null;
  private smoothedCenter: Point2D | null = null;
  private smoothedLeftEye: Point2D | null = null;
  private smoothedRightEye: Point2D | null = null;

  // Step 6 calibration sample buffer
  private calibrationSamples: Array<{
    centerX: number;
    centerY: number;
    faceWidth: number;
    interOcular: number;
    eyeLevelY: number;
    ear: number;
  }> = [];
  private calibrationPhase: CalibrationPhaseStatus = 'Checking camera';
  private calibrationError: string | null = null;
  private calibrationSucceeded: boolean = false;
  private calibrationSaved: boolean = false;
  private savedMetadata: PersistedCalibrationMetadata | null = null;

  constructor(
    config?: Partial<OnboardingVisionConfig>,
    stepsConfig: GuidedFaceStepConfig[] = GUIDED_FACE_CHECK_STEPS
  ) {
    this.config = { ...DEFAULT_ONBOARDING_VISION_CONFIG, ...config };
    this.stepsConfig = stepsConfig;
  }

  public getStepsConfig(): GuidedFaceStepConfig[] {
    return this.stepsConfig;
  }

  public resetFaceState(): void {
    this.currentStepIndex = 0;
    this.completedStepIds = [];
    this.currentStepHeldMs = 0;
    this.currentStepElapsedMs = 0;
    this.lastFaceTimestampMs = null;
    this.priorOpenEyesConfirmed = false;
    this.neutralReturnConfirmed = false;
    this.neutralHoldMs = 0;
    this.lastFailureReason = 'none';
    this.calibrationSkipped = false;
    this.lookStraightSamples = [];
    this.calibratedBaselineEAR = DEFAULT_BLINK_CONFIG.defaultBaselineEAR;
    this.pendingCalibrationMetadata = null;
    this.faceCalibrationSaved = false;
    this.consecutiveDetectedFrames = 0;
    this.consecutiveMissedFrames = 0;
    this.lastValidEvaluation = null;
    this.smoothedBox = null;
    this.smoothedCenter = null;
    this.smoothedLeftEye = null;
    this.smoothedRightEye = null;
    this.savedMetadata = null;
  }

  public resetEyeState(): void {
    this.eyeStableMs = 0;
    this.lastEyeTimestampMs = null;
    this.consecutiveMissedFrames = 0;
    this.lastValidEyeEvaluation = null;
  }

  public resetCalibrationState(): void {
    this.calibrationSamples = [];
    this.calibrationMissedFrames = 0;
    this.calibrationPhase = 'Checking camera';
    this.calibrationError = null;
    this.calibrationSucceeded = false;
    this.calibrationSaved = false;
    this.savedMetadata = null;
  }

  private mapX(rawX: number): number {
    return this.config.mirrorPreview ? 1 - rawX : rawX;
  }

  private extractGeometry(
    landmarks: NormalizedLandmark[] | null,
    videoAspect = 16 / 9,
    containerAspect = 4 / 3
  ): ExtractedFaceGeometry | null {
    if (!landmarks || landmarks.length < 468) {
      return null;
    }

    const pForehead = landmarks[10];
    const pChin = landmarks[152];
    const pLeftCheek = landmarks[234];
    const pRightCheek = landmarks[454];
    const pNose = landmarks[1];

    // Left eye contour landmarks
    const lOuter = landmarks[33];
    const lInner = landmarks[133];
    const lTop = landmarks[159];
    const lBottom = landmarks[145];

    // Right eye contour landmarks
    const rInner = landmarks[362];
    const rOuter = landmarks[263];
    const rTop = landmarks[386];
    const rBottom = landmarks[374];

    if (
      !isValidLandmark(pForehead) ||
      !isValidLandmark(pChin) ||
      !isValidLandmark(pLeftCheek) ||
      !isValidLandmark(pRightCheek) ||
      !isValidLandmark(pNose) ||
      !isValidLandmark(lOuter) ||
      !isValidLandmark(lInner) ||
      !isValidLandmark(lTop) ||
      !isValidLandmark(lBottom) ||
      !isValidLandmark(rInner) ||
      !isValidLandmark(rOuter) ||
      !isValidLandmark(rTop) ||
      !isValidLandmark(rBottom)
    ) {
      return null;
    }

    // Raw eye centers & dimensions in normalized video frame coordinates
    const rawLeftEyeCenter: Point2D = {
      x: (lOuter.x + lInner.x + lTop.x + lBottom.x) / 4,
      y: (lOuter.y + lInner.y + lTop.y + lBottom.y) / 4,
    };
    const rawRightEyeCenter: Point2D = {
      x: (rOuter.x + rInner.x + rTop.x + rBottom.x) / 4,
      y: (rOuter.y + rInner.y + rTop.y + rBottom.y) / 4,
    };

    const leftEyeWidth = dist2D(lOuter, lInner);
    const leftEyeHeight = dist2D(lTop, lBottom);
    const rightEyeWidth = dist2D(rOuter, rInner);
    const rightEyeHeight = dist2D(rTop, rBottom);

    const leftEyeEAR = leftEyeWidth > 0.005 ? leftEyeHeight / leftEyeWidth : 0;
    const rightEyeEAR = rightEyeWidth > 0.005 ? rightEyeHeight / rightEyeWidth : 0;
    const combinedEAR = (leftEyeEAR + rightEyeEAR) / 2;

    // Mirrored video coordinates mapped to the object-cover preview container
    const leftCheekPt = mapVideoPointToContainer(
      { x: this.mapX(pLeftCheek.x), y: pLeftCheek.y },
      videoAspect,
      containerAspect
    );
    const rightCheekPt = mapVideoPointToContainer(
      { x: this.mapX(pRightCheek.x), y: pRightCheek.y },
      videoAspect,
      containerAspect
    );
    const foreheadPt = mapVideoPointToContainer(
      { x: this.mapX(pForehead.x), y: pForehead.y },
      videoAspect,
      containerAspect
    );
    const chinPt = mapVideoPointToContainer(
      { x: this.mapX(pChin.x), y: pChin.y },
      videoAspect,
      containerAspect
    );
    const nosePt = mapVideoPointToContainer(
      { x: this.mapX(pNose.x), y: pNose.y },
      videoAspect,
      containerAspect
    );

    const minX = Math.min(leftCheekPt.x, rightCheekPt.x);
    const maxX = Math.max(leftCheekPt.x, rightCheekPt.x);
    const minY = Math.min(foreheadPt.y, chinPt.y);
    const maxY = Math.max(foreheadPt.y, chinPt.y);

    const dxCheek = pRightCheek.x - pLeftCheek.x;
    const dyCheek = pRightCheek.y - pLeftCheek.y;
    const rawFaceWidth = Math.sqrt(dxCheek * dxCheek + dyCheek * dyCheek);
    const rawFaceHeight = Math.abs(chinPt.y - foreheadPt.y);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const rawBox: NormalizedFaceBox = {
      minX,
      maxX,
      minY,
      maxY,
      width: rawFaceWidth,
      height: rawFaceHeight,
      centerX,
      centerY,
    };

    const previewLeftEye = mapVideoPointToContainer(
      { x: this.mapX(rawLeftEyeCenter.x), y: rawLeftEyeCenter.y },
      videoAspect,
      containerAspect
    );
    const previewRightEye = mapVideoPointToContainer(
      { x: this.mapX(rawRightEyeCenter.x), y: rawRightEyeCenter.y },
      videoAspect,
      containerAspect
    );

    const interOcular = dist2D(rawLeftEyeCenter, rawRightEyeCenter);

    // User-centric horizontal head yaw derived in the shared mirrored coordinate system:
    // - When the user turns to their own physical LEFT, their nose moves toward the LEFT side
    //   of the mirrored preview (nosePt.x < centerX => userYawOffsetRatio < 0, userYawDeg < 0).
    // - When the user turns to their own physical RIGHT, their nose moves toward the RIGHT side
    //   of the mirrored preview (nosePt.x > centerX => userYawOffsetRatio > 0, userYawDeg > 0).
    const halfContainerSpanX = Math.max(0.04, (maxX - minX) * 0.5);
    const userYawOffsetRatio = (nosePt.x - centerX) / halfContainerSpanX;
    const userYawDeg = Math.round(userYawOffsetRatio * 68);

    const distForeheadToNose = Math.abs(pNose.y - pForehead.y);
    const distNoseToChin = Math.abs(pChin.y - pNose.y);
    const pitchRatio =
      distForeheadToNose + distNoseToChin > 0.001
        ? (distForeheadToNose - distNoseToChin) / (distForeheadToNose + distNoseToChin)
        : 0;
    const pitch = Math.round(pitchRatio * 60);

    const dxEyes = rawRightEyeCenter.x - rawLeftEyeCenter.x;
    const dyEyes = rawRightEyeCenter.y - rawLeftEyeCenter.y;
    const roll = Math.round((Math.atan2(dyEyes, dxEyes) * 180) / Math.PI);

    const bothEyesValid =
      leftEyeWidth >= 0.014 &&
      rightEyeWidth >= 0.014 &&
      leftEyeEAR >= 0.05 &&
      rightEyeEAR >= 0.05;

    // Project real landmark mesh vertices into the shared container coordinate system
    const meshPoints: Point2D[] = ENABLE_REAL_LANDMARK_MESH
      ? REAL_MESH_LANDMARK_INDICES.map((idx) => landmarks[idx])
          .filter(isValidLandmark)
          .map((lm) =>
            mapVideoPointToContainer(
              { x: this.mapX(lm.x), y: lm.y },
              videoAspect,
              containerAspect
            )
          )
      : [];

    return {
      rawBox,
      rawFaceCenter: nosePt,
      previewLeftEye,
      previewRightEye,
      leftEyeWidth,
      rightEyeWidth,
      leftEyeEAR,
      rightEyeEAR,
      combinedEAR,
      bothEyesValid,
      interOcular,
      userYawOffsetRatio,
      userYawDeg,
      pitchRatio,
      headPose: { yaw: userYawDeg, pitch, roll },
      meshPoints,
    };
  }

  private updateSmoothedVisuals(
    rawBox: NormalizedFaceBox,
    rawCenter: Point2D,
    leftEye: Point2D,
    rightEye: Point2D
  ) {
    const alpha = 0.52;
    if (!this.smoothedBox || !this.smoothedCenter || !this.smoothedLeftEye || !this.smoothedRightEye) {
      this.smoothedBox = { ...rawBox };
      this.smoothedCenter = { ...rawCenter };
      this.smoothedLeftEye = { ...leftEye };
      this.smoothedRightEye = { ...rightEye };
    } else {
      this.smoothedBox = {
        minX: this.smoothedBox.minX * (1 - alpha) + rawBox.minX * alpha,
        maxX: this.smoothedBox.maxX * (1 - alpha) + rawBox.maxX * alpha,
        minY: this.smoothedBox.minY * (1 - alpha) + rawBox.minY * alpha,
        maxY: this.smoothedBox.maxY * (1 - alpha) + rawBox.maxY * alpha,
        width: this.smoothedBox.width * (1 - alpha) + rawBox.width * alpha,
        height: this.smoothedBox.height * (1 - alpha) + rawBox.height * alpha,
        centerX: this.smoothedBox.centerX * (1 - alpha) + rawBox.centerX * alpha,
        centerY: this.smoothedBox.centerY * (1 - alpha) + rawBox.centerY * alpha,
      };
      this.smoothedCenter = {
        x: this.smoothedCenter.x * (1 - alpha) + rawCenter.x * alpha,
        y: this.smoothedCenter.y * (1 - alpha) + rawCenter.y * alpha,
      };
      this.smoothedLeftEye = {
        x: this.smoothedLeftEye.x * (1 - alpha) + leftEye.x * alpha,
        y: this.smoothedLeftEye.y * (1 - alpha) + leftEye.y * alpha,
      };
      this.smoothedRightEye = {
        x: this.smoothedRightEye.x * (1 - alpha) + rightEye.x * alpha,
        y: this.smoothedRightEye.y * (1 - alpha) + rightEye.y * alpha,
      };
    }
  }

  private formatTimeoutDiagnostic(reason: GuidedFailureReason, stepId: GuidedFaceStepId): string {
    switch (reason) {
      case 'no_face':
        return 'Face not detected — make sure your face is uncovered and positioned in front of the camera.';
      case 'low_light':
        return 'Lighting is too low for reliable landmark tracking — brighten your surroundings or face a light source.';
      case 'face_size':
      case 'off_center':
        return 'Your face is outside the calibration area — adjust your distance and center your face inside the corner brackets.';
      case 'eyes_not_closed':
        return 'Eye closure was not detected — look naturally at the screen first, then gently close both eyes.';
      case 'needs_neutral':
        return 'Look straight at the screen briefly to establish a center reference before turning your head.';
      case 'angle_too_small':
      default:
        return stepId === 'turn_left'
          ? 'Head turn angle was too small — turn your head slightly farther toward your left shoulder.'
          : stepId === 'turn_right'
          ? 'Head turn angle was too small — turn your head slightly farther toward your right shoulder.'
          : 'Hold a steady, centered gaze toward the screen to complete this step.';
    }
  }

  private buildGuidedSnapshot(overrides: Partial<FacePositioningEvaluation>): FacePositioningEvaluation {
    const totalSteps = this.stepsConfig.length;
    const completedCount = this.completedStepIds.length;
    const allComplete = completedCount >= totalSteps;
    const activeConfig = !allComplete ? this.stepsConfig[this.currentStepIndex] : null;
    const stepHoldProgressPct = activeConfig
      ? Math.min(100, Math.round((this.currentStepHeldMs / activeConfig.holdDurationMs) * 100))
      : 100;
    const calibrationProgressPct = Math.round((completedCount / Math.max(1, totalSteps)) * 100);
    const thresholds = computeBlinkThresholds(this.calibratedBaselineEAR, DEFAULT_BLINK_CONFIG);

    const filledTickCount = Math.round((calibrationProgressPct / 100) * FACE_ID_TICK_COUNT);
    const filledTicks = new Array<boolean>(FACE_ID_TICK_COUNT)
      .fill(false)
      .map((_, i) => i < filledTickCount);

    return {
      faceDetected: false,
      landmarksValid: false,
      bothEyesValid: false,
      isLiveFrame: false,
      faceInsideGuide: false,
      detectionStable: allComplete,
      stabilityProgressPct: calibrationProgressPct,
      stableDurationMs: Math.round(this.currentStepHeldMs),
      canContinueFromFacePositioning: allComplete,
      detectionState: allComplete ? 'Ready' : 'Looking for your face',
      uiState: allComplete ? 'aligned' : 'searching',
      instruction: allComplete
        ? 'Calibration complete'
        : activeConfig?.instruction ?? 'Fit your face in the frame',
      helperText: allComplete
        ? 'All guided steps completed using live landmark measurements.'
        : activeConfig?.helperText ?? '',
      guideLabel: allComplete
        ? 'Calibration complete'
        : activeConfig?.instruction ?? 'Fit your face in the frame',
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
      closureThresholdEAR: thresholds.closureThresholdEAR,
      currentStepIndex: Math.min(this.currentStepIndex, Math.max(0, totalSteps - 1)),
      totalSteps,
      currentStepId: allComplete ? 'completed' : activeConfig!.id,
      completedStepIds: [...this.completedStepIds],
      stepSatisfied: allComplete,
      stepHoldProgressPct,
      stepTimedOut: false,
      timeoutDiagnostic: null,
      calibrationSkipped: this.calibrationSkipped,
      filledTicks,
      sectorFrameCounts: new Array<number>(FACE_ID_SECTOR_COUNT).fill(0),
      completedSectors: completedCount,
      totalSectors: totalSteps,
      activeSector: allComplete ? null : this.currentStepIndex,
      calibrationProgressPct,
      savedMetadata: this.savedMetadata,
      ...overrides,
    };
  }

  /**
   * Step 4: Evaluate the 5-step guided Face ID-style calibration sequence.
   * Advances each step strictly when its real detector predicate holds continuously
   * for `holdDurationMs` with `confidence >= minConfidence`.
   */
  public evaluateFacePositioning(
    landmarks: NormalizedLandmark[] | null,
    confidence: number,
    timestampMs: number,
    isLiveFrame: boolean,
    pipelineStatus: VisionPipelineStatus = 'ready',
    videoAspect = 16 / 9,
    containerAspect = 4 / 3,
    distanceEstimator?: DistanceEstimator
  ): FacePositioningEvaluation {
    if (pipelineStatus === 'error') {
      this.priorOpenEyesConfirmed = false;
      this.currentStepHeldMs = 0;
      return this.buildGuidedSnapshot({
        detectionState: 'Camera or detection error',
        uiState: 'error',
        instruction: 'Camera or detection error',
        helperText: 'Check camera permissions or close other apps using your camera, then retry.',
        guideLabel: 'Camera or detection error',
      });
    }

    if (pipelineStatus === 'initializing_camera') {
      this.priorOpenEyesConfirmed = false;
      this.currentStepHeldMs = 0;
      return this.buildGuidedSnapshot({
        detectionState: 'Initializing camera',
        uiState: 'initializing_camera',
        instruction: 'Initializing camera…',
        helperText: 'Starting your local camera stream.',
        guideLabel: 'Initializing camera',
      });
    }

    if (pipelineStatus === 'loading_detector') {
      this.priorOpenEyesConfirmed = false;
      this.currentStepHeldMs = 0;
      return this.buildGuidedSnapshot({
        isLiveFrame,
        detectionState: 'Loading face detection',
        uiState: 'loading_detector',
        instruction: 'Loading face detection…',
        helperText: 'Initializing local MediaPipe Face Landmarker model.',
        guideLabel: 'Loading face detection',
      });
    }

    const rawDt =
      this.lastFaceTimestampMs !== null
        ? Math.max(12, timestampMs - this.lastFaceTimestampMs)
        : 33;
    const dt = Math.min(120, rawDt);
    this.lastFaceTimestampMs = timestampMs;

    const totalSteps = this.stepsConfig.length;
    if (this.completedStepIds.length >= totalSteps) {
      return this.buildGuidedSnapshot({
        faceDetected: true,
        landmarksValid: true,
        bothEyesValid: true,
        isLiveFrame,
        faceInsideGuide: true,
        detectionStable: true,
        canContinueFromFacePositioning: true,
        detectionState: 'Ready',
        uiState: 'aligned',
        instruction: 'Calibration complete',
        helperText: 'Your reference position and open-eye baseline are saved.',
        stepSatisfied: true,
        faceBox: this.smoothedBox,
        faceCenter: this.smoothedCenter,
        leftEye: this.smoothedLeftEye,
        rightEye: this.smoothedRightEye,
      });
    }

    const activeStepConfig = this.stepsConfig[this.currentStepIndex];

    const geom =
      isLiveFrame && confidence >= this.config.minConfidence
        ? this.extractGeometry(landmarks, videoAspect, containerAspect)
        : null;

    // Missing face, covered camera, or low tracking confidence:
    // NEVER advances "Close your eyes" or any other step.
    if (!geom) {
      this.consecutiveMissedFrames += 1;
      // Immediately invalidate priorOpenEyesConfirmed and continuous step hold
      this.priorOpenEyesConfirmed = false;
      this.currentStepHeldMs = 0;
      this.neutralHoldMs = 0;
      this.currentStepElapsedMs += rawDt;
      this.lastFailureReason =
        isLiveFrame && landmarks && landmarks.length > 0 && confidence < this.config.minConfidence
          ? 'low_light'
          : 'no_face';

      this.consecutiveDetectedFrames = 0;
      this.smoothedBox = null;
      this.smoothedCenter = null;
      this.smoothedLeftEye = null;
      this.smoothedRightEye = null;
      this.lastValidEvaluation = null;

      const stepTimedOut = this.currentStepElapsedMs >= activeStepConfig.timeoutMs;
      const timeoutDiagnostic = stepTimedOut
        ? this.formatTimeoutDiagnostic(this.lastFailureReason, activeStepConfig.id)
        : null;

      return this.buildGuidedSnapshot({
        faceDetected: false,
        landmarksValid: false,
        bothEyesValid: false,
        isLiveFrame,
        faceInsideGuide: false,
        detectionState: 'Looking for your face',
        uiState: 'searching',
        instruction: activeStepConfig.instruction,
        helperText: timeoutDiagnostic ?? 'Looking for your face — make sure your face is visible and well lit.',
        guideLabel: 'Looking for your face',
        stepSatisfied: false,
        stepHoldProgressPct: 0,
        stepTimedOut,
        timeoutDiagnostic,
      });
    }

    // Valid face landmarks detected on live frame
    this.consecutiveMissedFrames = 0;
    this.consecutiveDetectedFrames += 1;

    const {
      rawBox,
      rawFaceCenter,
      previewLeftEye,
      previewRightEye,
      combinedEAR,
      bothEyesValid,
      interOcular,
      userYawDeg,
      headPose,
      meshPoints,
    } = geom;

    this.updateSmoothedVisuals(rawBox, rawFaceCenter, previewLeftEye, previewRightEye);

    const eyeMidpoint: Point2D = {
      x: (this.smoothedLeftEye!.x + this.smoothedRightEye!.x) / 2,
      y: (this.smoothedLeftEye!.y + this.smoothedRightEye!.y) / 2,
    };
    const eyeLevelY = eyeMidpoint.y;

    // Compute existing EAR thresholds from current baseline
    const thresholds = computeBlinkThresholds(this.calibratedBaselineEAR, DEFAULT_BLINK_CONFIG);

    // Track whether the user's eyes were genuinely observed open immediately before eye-closure
    if (bothEyesValid && combinedEAR >= thresholds.reopenThresholdEAR) {
      this.priorOpenEyesConfirmed = true;
    }

    // Track neutral return requirement between directional steps
    if (activeStepConfig.requiresNeutralBeforeStart && !this.neutralReturnConfirmed) {
      if (
        Math.abs(userYawDeg) <= GUIDED_NEUTRAL_RETURN_YAW_DEG &&
        Math.abs(headPose.pitch) <= GUIDED_NEUTRAL_PITCH_MAX_DEG
      ) {
        this.neutralHoldMs += dt;
        if (this.neutralHoldMs >= GUIDED_NEUTRAL_RETURN_MS) {
          this.neutralReturnConfirmed = true;
        }
      } else {
        this.neutralHoldMs = 0;
      }
    }

    const predicateResult = activeStepConfig.predicate({
      geom,
      baselineEAR: thresholds.baselineEAR,
      closureThresholdEAR: thresholds.closureThresholdEAR,
      reopenThresholdEAR: thresholds.reopenThresholdEAR,
      priorOpenEyesConfirmed: this.priorOpenEyesConfirmed,
      neutralReturnConfirmed: this.neutralReturnConfirmed,
    });

    let stepSatisfied = predicateResult.passed;
    let helperText = predicateResult.feedbackHint || activeStepConfig.helperText;

    if (predicateResult.passed) {
      this.currentStepHeldMs += dt;

      // Step 2 ('look_straight'): feed real open-eye & distance samples into baseline buffer
      if (activeStepConfig.id === 'look_straight') {
        this.lookStraightSamples.push({
          centerX: rawBox.centerX,
          centerY: rawBox.centerY,
          faceWidth: rawBox.width,
          interOcular,
          eyeLevelY,
          ear: combinedEAR,
        });

        const medianEAR = Number(
          Math.min(
            0.42,
            Math.max(0.18, median(this.lookStraightSamples.map((s) => s.ear)))
          ).toFixed(3)
        );
        this.calibratedBaselineEAR = medianEAR;
      }

      // Check if current step has been held continuously for its required holdDurationMs
      if (this.currentStepHeldMs >= activeStepConfig.holdDurationMs) {
        if (!this.completedStepIds.includes(activeStepConfig.id)) {
          this.completedStepIds.push(activeStepConfig.id);
        }

        // Finalize pending baseline metadata when 'look_straight' completes (using unchanged median formulas)
        if (activeStepConfig.id === 'look_straight' && this.lookStraightSamples.length > 0) {
          const refCenterX = Number(
            median(this.lookStraightSamples.map((s) => s.centerX)).toFixed(4)
          );
          const refCenterY = Number(
            median(this.lookStraightSamples.map((s) => s.centerY)).toFixed(4)
          );
          const refFaceWidth = Number(
            median(this.lookStraightSamples.map((s) => s.faceWidth)).toFixed(4)
          );
          const refInterOcular = Number(
            median(this.lookStraightSamples.map((s) => s.interOcular)).toFixed(4)
          );
          const refEyeLevelY = Number(
            median(this.lookStraightSamples.map((s) => s.eyeLevelY)).toFixed(4)
          );
          const refEAR = Number(
            Math.min(
              0.42,
              Math.max(0.18, median(this.lookStraightSamples.map((s) => s.ear)))
            ).toFixed(3)
          );

          this.calibratedBaselineEAR = refEAR;
          this.pendingCalibrationMetadata = {
            calibrationVersion: CALIBRATION_SCHEMA_VERSION,
            timestamp: Date.now(),
            normalizedFacePosition: { x: refCenterX, y: refCenterY },
            normalizedFaceWidth: refFaceWidth,
            interOcularDistance: refInterOcular,
            eyeLevelY: refEyeLevelY,
            baselineEAR: refEAR,
            relativeDistanceBaseline: 1.0,
            calibrationValid: true,
          };
        }

        // Advance to next step
        this.currentStepIndex += 1;
        this.currentStepHeldMs = 0;
        this.currentStepElapsedMs = 0;
        this.neutralReturnConfirmed = false;
        this.neutralHoldMs = 0;
        this.lastFailureReason = 'none';
      }
    } else {
      // Predicate not met on this frame: reset continuous hold duration
      this.currentStepHeldMs = 0;
      this.currentStepElapsedMs += rawDt;
      this.lastFailureReason = predicateResult.failureReason;
    }

    const allStepsComplete = this.completedStepIds.length >= totalSteps;

    // Persist baseline calibration ONLY when all guided steps are genuinely completed
    if (allStepsComplete && !this.faceCalibrationSaved) {
      const fallbackMeta: PersistedCalibrationMetadata =
        this.pendingCalibrationMetadata ?? {
          calibrationVersion: CALIBRATION_SCHEMA_VERSION,
          timestamp: Date.now(),
          normalizedFacePosition: {
            x: Number(rawBox.centerX.toFixed(4)),
            y: Number(rawBox.centerY.toFixed(4)),
          },
          normalizedFaceWidth: Number(rawBox.width.toFixed(4)),
          interOcularDistance: Number(interOcular.toFixed(4)),
          eyeLevelY: Number(eyeLevelY.toFixed(4)),
          baselineEAR: Number(
            Math.min(0.42, Math.max(0.18, this.calibratedBaselineEAR)).toFixed(3)
          ),
          relativeDistanceBaseline: 1.0,
          calibrationValid: true,
        };

      OnboardingSetupStorage.saveCalibrationMetadata(fallbackMeta, distanceEstimator);
      this.savedMetadata = fallbackMeta;
      this.faceCalibrationSaved = true;
    }

    const nextActiveConfig = !allStepsComplete
      ? this.stepsConfig[this.currentStepIndex]
      : null;

    const stepTimedOut =
      !allStepsComplete &&
      this.currentStepElapsedMs >= (nextActiveConfig?.timeoutMs ?? STEP_TIMEOUT_MS);
    const timeoutDiagnostic =
      stepTimedOut && nextActiveConfig
        ? this.formatTimeoutDiagnostic(this.lastFailureReason, nextActiveConfig.id)
        : null;

    if (allStepsComplete) {
      stepSatisfied = true;
      helperText = 'Your reference position and open-eye baseline are saved.';
    } else if (timeoutDiagnostic) {
      helperText = timeoutDiagnostic;
    } else if (nextActiveConfig && nextActiveConfig.id !== activeStepConfig.id) {
      // Just transitioned to a new step on this frame
      helperText = nextActiveConfig.helperText;
    }

    const evaluation = this.buildGuidedSnapshot({
      faceDetected: true,
      landmarksValid: true,
      bothEyesValid,
      isLiveFrame,
      faceInsideGuide: stepSatisfied,
      detectionStable: allStepsComplete,
      canContinueFromFacePositioning: allStepsComplete,
      detectionState: allStepsComplete
        ? 'Ready'
        : stepSatisfied
        ? 'Hold still'
        : 'Position your face',
      uiState: allStepsComplete
        ? 'aligned'
        : stepSatisfied
        ? 'hold_still'
        : 'aligning',
      instruction: allStepsComplete
        ? 'Calibration complete'
        : nextActiveConfig!.instruction,
      helperText,
      guideLabel: allStepsComplete
        ? 'Calibration complete'
        : nextActiveConfig!.instruction,
      faceBox: this.smoothedBox,
      faceCenter: this.smoothedCenter,
      meshPoints,
      leftEye: this.smoothedLeftEye,
      rightEye: this.smoothedRightEye,
      eyeMidpoint,
      eyeLevelY,
      headPose,
      currentEyeEAR: Number(combinedEAR.toFixed(3)),
      closureThresholdEAR: thresholds.closureThresholdEAR,
      stepSatisfied,
      stepTimedOut,
      timeoutDiagnostic,
    });

    this.lastValidEvaluation = evaluation;
    return evaluation;
  }

  /**
   * Step 5: Evaluate eye-level alignment and both-eyes visibility gate
   */
  public evaluateEyeAlignment(
    landmarks: NormalizedLandmark[] | null,
    confidence: number,
    timestampMs: number,
    isLiveFrame: boolean,
    pipelineStatus: VisionPipelineStatus = 'ready',
    videoAspect = 16 / 9,
    containerAspect = 4 / 3
  ): EyeAlignmentEvaluation {
    if (pipelineStatus === 'error') {
      return {
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
        detectionState: 'Camera or detection error',
        instruction: 'Camera or detection error',
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
    }

    if (pipelineStatus === 'initializing_camera' || pipelineStatus === 'loading_detector') {
      const stateLabel: TruthfulDetectionState =
        pipelineStatus === 'initializing_camera'
          ? 'Initializing camera'
          : 'Loading face detection';
      return {
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
        detectionState: stateLabel,
        instruction:
          pipelineStatus === 'initializing_camera'
            ? 'Initializing camera…'
            : 'Loading face detection…',
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
    }

    const geom =
      isLiveFrame && confidence >= this.config.minConfidence
        ? this.extractGeometry(landmarks, videoAspect, containerAspect)
        : null;

    if (!geom) {
      this.consecutiveMissedFrames += 1;
      if (this.consecutiveMissedFrames <= 3 && this.lastValidEyeEvaluation) {
        this.lastEyeTimestampMs = timestampMs;
        return this.lastValidEyeEvaluation;
      }

      this.eyeStableMs = Math.max(0, this.eyeStableMs - 60);
      this.lastEyeTimestampMs = timestampMs;
      this.lastValidEyeEvaluation = null;

      return {
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
        detectionState: 'Looking for your face',
        instruction: 'Looking for your face…',
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
    }

    this.consecutiveMissedFrames = 0;

    const {
      rawBox,
      rawFaceCenter,
      previewLeftEye,
      previewRightEye,
      leftEyeWidth,
      rightEyeWidth,
      leftEyeEAR,
      rightEyeEAR,
      headPose,
    } = geom;

    this.updateSmoothedVisuals(rawBox, rawFaceCenter, previewLeftEye, previewRightEye);

    const eyeMidX = (previewLeftEye.x + previewRightEye.x) / 2;
    const eyeMidY = (previewLeftEye.y + previewRightEye.y) / 2;
    const smoothedMidpoint: Point2D = {
      x: (this.smoothedLeftEye!.x + this.smoothedRightEye!.x) / 2,
      y: (this.smoothedLeftEye!.y + this.smoothedRightEye!.y) / 2,
    };

    const leftDetected =
      previewLeftEye.x > 0.02 &&
      previewLeftEye.x < 0.98 &&
      previewLeftEye.y > 0.02 &&
      previewLeftEye.y < 0.98 &&
      leftEyeWidth >= 0.014 &&
      leftEyeEAR >= 0.06;

    const rightDetected =
      previewRightEye.x > 0.02 &&
      previewRightEye.x < 0.98 &&
      previewRightEye.y > 0.02 &&
      previewRightEye.y < 0.98 &&
      rightEyeWidth >= 0.014 &&
      rightEyeEAR >= 0.06;

    const bothEyesDetected = leftDetected && rightDetected;

    const widthRatio = rightEyeWidth > 0.001 ? leftEyeWidth / rightEyeWidth : 0;
    const bothEyesReliable =
      bothEyesDetected &&
      confidence >= this.config.minConfidence &&
      widthRatio >= 0.45 &&
      widthRatio <= 2.2;

    const eyeMidpointInsideArea =
      eyeMidX >= 0.24 &&
      eyeMidX <= 0.76 &&
      eyeMidY >= 0.18 &&
      eyeMidY <= 0.74;

    const headRotationValid =
      Math.abs(headPose.yaw) <= 26 &&
      Math.abs(headPose.pitch) <= 26 &&
      Math.abs(headPose.roll) <= 24;

    const eyeLevelAligned =
      eyeMidY >= this.config.eyeLevelMinY && eyeMidY <= this.config.eyeLevelMaxY;

    const allInstantChecksPass =
      bothEyesDetected &&
      bothEyesReliable &&
      eyeMidpointInsideArea &&
      headRotationValid &&
      eyeLevelAligned;

    const dt =
      this.lastEyeTimestampMs !== null
        ? Math.min(100, Math.max(16, timestampMs - this.lastEyeTimestampMs))
        : 33;
    this.lastEyeTimestampMs = timestampMs;

    if (allInstantChecksPass) {
      this.eyeStableMs = Math.min(this.config.requiredStabilityMs + 100, this.eyeStableMs + dt);
    } else {
      this.eyeStableMs = Math.max(0, this.eyeStableMs - dt * 1.2);
    }

    const stabilityProgressPct = Math.min(
      100,
      Math.round((this.eyeStableMs / this.config.requiredStabilityMs) * 100)
    );
    const eyeDetectionStable = this.eyeStableMs >= this.config.requiredStabilityMs;

    let instruction: EyeAlignmentEvaluation['instruction'] = 'Ready';
    let detectionState: TruthfulDetectionState = 'Ready';
    let secondaryStatus: string | null = null;

    if (!bothEyesDetected || !bothEyesReliable) {
      detectionState = 'Position your face';
      instruction = 'Keep both eyes visible';
    } else if (eyeMidY < this.config.eyeLevelMinY) {
      detectionState = 'Position your face';
      instruction = 'Raise the camera slightly';
    } else if (eyeMidY > this.config.eyeLevelMaxY) {
      detectionState = 'Position your face';
      instruction = 'Lower the camera slightly';
    } else if (!eyeMidpointInsideArea || !headRotationValid) {
      detectionState = 'Position your face';
      instruction = 'Center your face';
    } else if (!eyeDetectionStable) {
      detectionState = 'Hold still';
      instruction = 'Hold still';
    } else {
      detectionState = 'Ready';
      instruction = 'Ready';
      secondaryStatus = 'Both eyes and eyelid landmarks verified';
    }

    const canContinueFromEyeAlignment = allInstantChecksPass && eyeDetectionStable;
    const filledCount = Math.round((stabilityProgressPct / 100) * FACE_ID_TICK_COUNT);
    const filledTicks = new Array<boolean>(FACE_ID_TICK_COUNT)
      .fill(false)
      .map((_, i) => i < filledCount);

    const evaluation: EyeAlignmentEvaluation = {
      faceDetected: true,
      bothEyesDetected,
      bothEyesReliable,
      eyeMidpointInsideArea,
      headRotationValid,
      eyeLevelAligned,
      eyeDetectionStable,
      stabilityProgressPct,
      stableDurationMs: Math.round(this.eyeStableMs),
      canContinueFromEyeAlignment,
      detectionState,
      instruction,
      secondaryStatus,
      faceBox: this.smoothedBox,
      silhouettePoints: null,
      leftEye: this.smoothedLeftEye,
      rightEye: this.smoothedRightEye,
      eyeMidpoint: smoothedMidpoint,
      eyeLevelY: smoothedMidpoint.y,
      headPose,
      leftEyeEAR,
      rightEyeEAR,
      filledTicks,
    };

    this.lastValidEyeEvaluation = evaluation;
    return evaluation;
  }

  /**
   * Step 6: Process a live frame during the active calibration sequence
   */
  public processCalibrationFrame(
    landmarks: NormalizedLandmark[] | null,
    confidence: number,
    timestampMs: number,
    isLiveFrame: boolean,
    isCameraActive: boolean,
    distanceEstimator: DistanceEstimator,
    videoAspect = 16 / 9,
    containerAspect = 4 / 3
  ): CalibrationProgressState {
    const required = this.config.requiredCalibrationSamples;

    if (this.calibrationSucceeded && this.calibrationSaved) {
      return {
        phase: 'Calibration saved',
        progressPct: 100,
        samplesCollected: required,
        requiredSamples: required,
        calibrationSucceeded: true,
        calibrationSaved: true,
        canFinishCalibration: true,
        errorExplanation: null,
        savedMetadata: this.savedMetadata,
        filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(true),
      };
    }

    if (this.calibrationError) {
      return {
        phase: 'Calibration failed',
        progressPct: 0,
        samplesCollected: this.calibrationSamples.length,
        requiredSamples: required,
        calibrationSucceeded: false,
        calibrationSaved: false,
        canFinishCalibration: false,
        errorExplanation: this.calibrationError,
        savedMetadata: null,
        filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
      };
    }

    if (!isCameraActive || !isLiveFrame) {
      this.calibrationSamples = [];
      this.calibrationError =
        'The camera stream was interrupted. Please check your camera and retry.';
      return {
        phase: 'Calibration failed',
        progressPct: 0,
        samplesCollected: 0,
        requiredSamples: required,
        calibrationSucceeded: false,
        calibrationSaved: false,
        canFinishCalibration: false,
        errorExplanation: this.calibrationError,
        savedMetadata: null,
        filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
      };
    }

    const geom =
      confidence >= this.config.minConfidence
        ? this.extractGeometry(landmarks, videoAspect, containerAspect)
        : null;

    if (!geom) {
      this.calibrationMissedFrames += 1;
      if (this.calibrationMissedFrames <= 4) {
        const count = this.calibrationSamples.length;
        const pct = Math.min(92, Math.round((count / required) * 90));
        const filledCount = Math.round((pct / 100) * FACE_ID_TICK_COUNT);
        return {
          phase: this.calibrationPhase,
          progressPct: pct,
          samplesCollected: count,
          requiredSamples: required,
          calibrationSucceeded: false,
          calibrationSaved: false,
          canFinishCalibration: false,
          errorExplanation: null,
          savedMetadata: null,
          filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT)
            .fill(false)
            .map((_, i) => i < filledCount),
        };
      }
      this.calibrationSamples = [];
      this.calibrationError =
        'Your face disappeared from the camera view. Position your face inside the frame and retry.';
      return {
        phase: 'Calibration failed',
        progressPct: 0,
        samplesCollected: 0,
        requiredSamples: required,
        calibrationSucceeded: false,
        calibrationSaved: false,
        canFinishCalibration: false,
        errorExplanation: this.calibrationError,
        savedMetadata: null,
        filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
      };
    }

    this.calibrationMissedFrames = 0;

    const {
      rawBox,
      previewLeftEye,
      previewRightEye,
      leftEyeWidth,
      rightEyeWidth,
      leftEyeEAR,
      rightEyeEAR,
      interOcular,
      headPose,
    } = geom;

    const eyesValid =
      leftEyeWidth >= 0.014 &&
      rightEyeWidth >= 0.014 &&
      leftEyeEAR >= 0.05 &&
      rightEyeEAR >= 0.05 &&
      Math.abs(headPose.yaw) <= 28 &&
      Math.abs(headPose.pitch) <= 28;

    const insideFrame =
      rawBox.centerX >= 0.24 &&
      rawBox.centerX <= 0.76 &&
      rawBox.centerY >= 0.18 &&
      rawBox.centerY <= 0.82 &&
      rawBox.width >= 0.10 &&
      rawBox.width <= 0.72;

    if (!eyesValid || !insideFrame) {
      this.calibrationSamples = [];
      this.calibrationError =
        'Position shifted outside the frame during calibration. Sit comfortably facing the screen and retry.';
      return {
        phase: 'Calibration failed',
        progressPct: 0,
        samplesCollected: 0,
        requiredSamples: required,
        calibrationSucceeded: false,
        calibrationSaved: false,
        canFinishCalibration: false,
        errorExplanation: this.calibrationError,
        savedMetadata: null,
        filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
      };
    }

    if (this.calibrationSamples.length > 0) {
      const first = this.calibrationSamples[0];
      const driftX = Math.abs(rawBox.centerX - first.centerX);
      const driftY = Math.abs(rawBox.centerY - first.centerY);
      if (driftX > 0.15 || driftY > 0.15) {
        this.calibrationSamples = [];
        this.calibrationError =
          'Large movement detected during calibration. Hold a comfortable, steady posture and retry.';
        return {
          phase: 'Calibration failed',
          progressPct: 0,
          samplesCollected: 0,
          requiredSamples: required,
          calibrationSucceeded: false,
          calibrationSaved: false,
          canFinishCalibration: false,
          errorExplanation: this.calibrationError,
          savedMetadata: null,
          filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
        };
      }
    }

    const combinedEAR = (leftEyeEAR + rightEyeEAR) / 2;
    const eyeLevelY = (previewLeftEye.y + previewRightEye.y) / 2;

    this.calibrationSamples.push({
      centerX: rawBox.centerX,
      centerY: rawBox.centerY,
      faceWidth: rawBox.width,
      interOcular,
      eyeLevelY,
      ear: combinedEAR,
    });

    const count = this.calibrationSamples.length;

    if (count <= 2) {
      this.calibrationPhase = 'Checking camera';
    } else if (count <= 5) {
      this.calibrationPhase = 'Confirming face and eye alignment';
    } else if (count < required) {
      this.calibrationPhase = 'Collecting reference measurements';
    } else {
      this.calibrationPhase = 'Saving calibration';
    }

    if (count < required) {
      const pct = Math.min(92, Math.round((count / required) * 90));
      const filledCount = Math.round((pct / 100) * FACE_ID_TICK_COUNT);
      return {
        phase: this.calibrationPhase,
        progressPct: pct,
        samplesCollected: count,
        requiredSamples: required,
        calibrationSucceeded: false,
        calibrationSaved: false,
        canFinishCalibration: false,
        errorExplanation: null,
        savedMetadata: null,
        filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT)
          .fill(false)
          .map((_, i) => i < filledCount),
      };
    }

    const refCenterX = Number(median(this.calibrationSamples.map((s) => s.centerX)).toFixed(4));
    const refCenterY = Number(median(this.calibrationSamples.map((s) => s.centerY)).toFixed(4));
    const refFaceWidth = Number(median(this.calibrationSamples.map((s) => s.faceWidth)).toFixed(4));
    const refInterOcular = Number(median(this.calibrationSamples.map((s) => s.interOcular)).toFixed(4));
    const refEyeLevelY = Number(median(this.calibrationSamples.map((s) => s.eyeLevelY)).toFixed(4));
    const refEAR = Number(
      Math.min(0.42, Math.max(0.18, median(this.calibrationSamples.map((s) => s.ear)))).toFixed(3)
    );

    const metadata: PersistedCalibrationMetadata = {
      calibrationVersion: CALIBRATION_SCHEMA_VERSION,
      timestamp: Date.now(),
      normalizedFacePosition: { x: refCenterX, y: refCenterY },
      normalizedFaceWidth: refFaceWidth,
      interOcularDistance: refInterOcular,
      eyeLevelY: refEyeLevelY,
      baselineEAR: refEAR,
      relativeDistanceBaseline: 1.0,
      calibrationValid: true,
    };

    const savedOk = OnboardingSetupStorage.saveCalibrationMetadata(metadata, distanceEstimator);

    if (!savedOk) {
      this.calibrationError =
        'Failed to save calibration reference to local storage. Please retry.';
      return {
        phase: 'Calibration failed',
        progressPct: 0,
        samplesCollected: count,
        requiredSamples: required,
        calibrationSucceeded: false,
        calibrationSaved: false,
        canFinishCalibration: false,
        errorExplanation: this.calibrationError,
        savedMetadata: null,
        filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(false),
      };
    }

    this.calibrationSucceeded = true;
    this.calibrationSaved = true;
    this.savedMetadata = metadata;
    this.calibrationPhase = 'Saving calibration';

    return {
      phase: 'Saving calibration',
      progressPct: 100,
      samplesCollected: required,
      requiredSamples: required,
      calibrationSucceeded: true,
      calibrationSaved: true,
      canFinishCalibration: true,
      errorExplanation: null,
      savedMetadata: metadata,
      filledTicks: new Array<boolean>(FACE_ID_TICK_COUNT).fill(true),
    };
  }
}

/**
 * Persistence manager for onboarding progress, privacy acknowledgement, and calibration validity.
 */
export class OnboardingSetupStorage {
  public static getRecord(): PersistedOnboardingRecord {
    const defaultRecord: PersistedOnboardingRecord = {
      version: CALIBRATION_SCHEMA_VERSION,
      privacyAcknowledged: false,
      privacyAcknowledgedAt: 0,
      cameraPermissionGranted: false,
      calibrationSaved: false,
      calibratedAt: 0,
      setupCompleted: false,
      completedAt: 0,
      calibrationMetadata: null,
    };

    try {
      const raw = localStorage.getItem(ONBOARDING_SETUP_STORAGE_KEY);
      if (!raw) return defaultRecord;
      const parsed = JSON.parse(raw) as Partial<PersistedOnboardingRecord>;
      return {
        ...defaultRecord,
        ...parsed,
      };
    } catch {
      return defaultRecord;
    }
  }

  public static saveRecord(update: Partial<PersistedOnboardingRecord>): boolean {
    try {
      const current = this.getRecord();
      const next: PersistedOnboardingRecord = {
        ...current,
        ...update,
        version: CALIBRATION_SCHEMA_VERSION,
      };
      localStorage.setItem(ONBOARDING_SETUP_STORAGE_KEY, JSON.stringify(next));
      const verifyRaw = localStorage.getItem(ONBOARDING_SETUP_STORAGE_KEY);
      return !!verifyRaw;
    } catch {
      return false;
    }
  }

  public static markPrivacyAcknowledged(): boolean {
    return this.saveRecord({
      privacyAcknowledged: true,
      privacyAcknowledgedAt: Date.now(),
    });
  }

  public static markCameraPermissionGranted(granted: boolean): boolean {
    if (granted) {
      CameraService.markPermissionGranted();
    } else {
      CameraService.clearStoredPermission();
    }
    return this.saveRecord({
      cameraPermissionGranted: granted,
    });
  }

  public static saveCalibrationMetadata(
    metadata: PersistedCalibrationMetadata,
    distanceEstimator?: DistanceEstimator
  ): boolean {
    if (
      !metadata ||
      !metadata.calibrationValid ||
      metadata.normalizedFaceWidth <= 0.05 ||
      metadata.interOcularDistance <= 0.01
    ) {
      return false;
    }

    try {
      if (distanceEstimator) {
        distanceEstimator.saveCalibration(
          metadata.baselineEAR,
          metadata.normalizedFaceWidth,
          48
        );
      }

      const fullCalibData: CalibrationData = {
        baselineEAR: metadata.baselineEAR,
        baselineFaceWidth: metadata.normalizedFaceWidth,
        referenceDistanceCm: 48,
        calibratedAt: metadata.timestamp,
        calibrationVersion: metadata.calibrationVersion,
        normalizedFacePosition: metadata.normalizedFacePosition,
        interOcularDistance: metadata.interOcularDistance,
        eyeLevelY: metadata.eyeLevelY,
        relativeDistanceBaseline: metadata.relativeDistanceBaseline,
        calibrationValid: true,
      };
      localStorage.setItem('iris_vision_calibration_v1', JSON.stringify(fullCalibData));

      const ok = this.saveRecord({
        calibrationSaved: true,
        calibratedAt: metadata.timestamp,
        calibrationMetadata: metadata,
      });

      const verify = this.getRecord();
      return (
        ok &&
        verify.calibrationSaved === true &&
        verify.calibrationMetadata?.timestamp === metadata.timestamp
      );
    } catch {
      return false;
    }
  }

  public static markSetupComplete(): boolean {
    const rec = this.getRecord();
    if (!rec.privacyAcknowledged || !rec.cameraPermissionGranted || !rec.calibrationSaved) {
      return false;
    }
    try {
      localStorage.setItem('iris_onboarding_completed_v2', 'true');
    } catch {
      // ignore
    }
    return this.saveRecord({
      setupCompleted: true,
      completedAt: Date.now(),
    });
  }

  public static invalidateCalibration(): void {
    this.saveRecord({
      calibrationSaved: false,
      calibratedAt: 0,
      calibrationMetadata: null,
    });
  }

  public static isCalibrationValid(): boolean {
    const rec = this.getRecord();
    if (!rec.calibrationSaved || !rec.calibrationMetadata || !rec.calibrationMetadata.calibrationValid) {
      return false;
    }
    const meta = rec.calibrationMetadata;
    if (
      meta.normalizedFaceWidth <= 0.05 ||
      meta.normalizedFaceWidth >= 0.95 ||
      meta.interOcularDistance <= 0.01
    ) {
      return false;
    }
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - meta.timestamp > maxAgeMs) {
      return false;
    }
    return true;
  }

  public static resolveStartupRoute(browserPermission: 'granted' | 'prompt' | 'denied'): {
    requiresOnboarding: boolean;
    initialStep: OnboardingStep;
    recoveryReason?: string;
  } {
    const rec = this.getRecord();
    const calibrationValid = this.isCalibrationValid();

    if (!rec.privacyAcknowledged || !rec.setupCompleted) {
      return {
        requiresOnboarding: true,
        initialStep: 'welcome',
      };
    }

    if (browserPermission === 'denied' || !rec.cameraPermissionGranted || !CameraService.hasStoredPermission()) {
      return {
        requiresOnboarding: true,
        initialStep: 'cameraPermission',
        recoveryReason: 'Camera permission is required to continue using IRIS.',
      };
    }

    if (!calibrationValid) {
      return {
        requiresOnboarding: true,
        initialStep: 'facePositioning',
        recoveryReason: 'Your camera position calibration needs to be refreshed.',
      };
    }

    return {
      requiresOnboarding: false,
      initialStep: 'complete',
    };
  }
}
