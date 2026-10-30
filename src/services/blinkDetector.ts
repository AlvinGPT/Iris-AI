import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { BlinkCandidateLog } from '../types';

export type BlinkState =
  | 'CALIBRATING'
  | 'OPEN'
  | 'CLOSING'
  | 'PARTIALLY_CLOSED'
  | 'CLOSED'
  | 'REOPENING'
  | 'PROLONGED_CLOSURE';

export type BlinkType = 'Full' | 'Partial';

export interface BlinkDetectorConfig {
  /** Default open-eye EAR baseline before personal calibration completes */
  defaultBaselineEAR: number;
  /** Minimum physiological open-eye EAR baseline */
  minBaselineEAR: number;
  /** Maximum physiological open-eye EAR baseline */
  maxBaselineEAR: number;
  /**
   * Lower hysteresis threshold ratio (closure entry):
   * When eye aperture (EAR) falls at or below `baselineEAR * closureThresholdRatio`
   * (16% relative reduction from open-eye baseline, within the 15-25% target window),
   * the eye enters the candidate closing/closed state.
   */
  closureThresholdRatio: number;
  /**
   * Ratio of baseline EAR at or below which a validated blink is classified as 'Full' vs 'Partial'.
   * Default: 0.76 (24% relative reduction from open baseline = Full; 15-24% reduction = Partial/shallow).
   */
  fullClosureRatio: number;
  /**
   * Upper hysteresis threshold ratio (reopening recognition):
   * After entering closure, the eye aperture must rise back at or above
   * `baselineEAR * reopenThresholdRatio` to be recognized as reopened.
   * Default: 0.91 (within 9% of open baseline; provides a clean 7% hysteresis band above 0.84).
   */
  reopenThresholdRatio: number;
  /** Normalized closure score [0..1] entry threshold */
  closureScoreThreshold: number;
  /** Normalized closure score [0..1] reopen hysteresis threshold */
  reopenScoreThreshold: number;
  /** Minimum closed-eye frames required (1 frame sufficient for quick 50-100ms blinks at 30-60 FPS) */
  minClosedFrames: number;
  /** Minimum total blink duration (ms) from closure onset (last open frame) to reopening */
  minBlinkDurationMs: number;
  /** Maximum blink duration (ms) before classifying as prolonged intentional eye closure */
  maxBlinkDurationMs: number;
  /** Refractory period (ms) after a validated blink to prevent double-counting without suppressing rapid blinks */
  minInterBlinkIntervalMs: number;
  /** Minimum valid observed monitoring duration (seconds) before calculating average BPM */
  minObservationSecondsForBpm: number;
}

export const DEFAULT_BLINK_CONFIG: BlinkDetectorConfig = {
  defaultBaselineEAR: 0.28,
  minBaselineEAR: 0.17,
  maxBaselineEAR: 0.42,
  closureThresholdRatio: 0.84, // 16.0% relative EAR reduction triggers candidate blink (e.g. 0.235 for 0.280 baseline)
  fullClosureRatio: 0.76,      // 24.0% relative EAR reduction classifies as Full blink (15-24% = Partial/shallow blink)
  reopenThresholdRatio: 0.91,  // 9.0% below baseline required to confirm reopening (hysteresis upper bound)
  closureScoreThreshold: 0.48,
  reopenScoreThreshold: 0.28,
  minClosedFrames: 1,          // Supports quick 50-100ms natural blinks at 24-60 FPS
  minBlinkDurationMs: 35,      // Measured from onset (last open frame) to reopen frame: allows 50-100ms quick blinks
  maxBlinkDurationMs: 650,     // Rejects intentional prolonged eye closures (> 650ms)
  minInterBlinkIntervalMs: 110,// Prevents bounce double-counts while allowing natural rapid double-blinks
  minObservationSecondsForBpm: 5,
};

export interface BlinkThresholdSnapshot {
  baselineEAR: number;
  closureThresholdEAR: number;
  reopenThresholdEAR: number;
  fullClosureThresholdEAR: number;
}

/**
 * Shared threshold calculation used by both BlinkDetector and the live Oscilloscope Graph.
 * Lower EAR values represent a more closed eye.
 */
export function computeBlinkThresholds(
  baselineEAR: number,
  config: BlinkDetectorConfig = DEFAULT_BLINK_CONFIG
): BlinkThresholdSnapshot {
  const safeBaseline = Math.max(
    config.minBaselineEAR,
    Math.min(
      config.maxBaselineEAR,
      Number.isFinite(baselineEAR) && baselineEAR > 0 ? baselineEAR : config.defaultBaselineEAR
    )
  );
  return {
    baselineEAR: Number(safeBaseline.toFixed(3)),
    closureThresholdEAR: Number((safeBaseline * config.closureThresholdRatio).toFixed(3)),
    reopenThresholdEAR: Number((safeBaseline * config.reopenThresholdRatio).toFixed(3)),
    fullClosureThresholdEAR: Number((safeBaseline * config.fullClosureRatio).toFixed(3)),
  };
}

// Canonical MediaPipe Face Mesh landmark indices for Eye Aspect Ratio (EAR)
// 8-point periorbital contours per eye (lateral canthus, medial canthus, 3 superior, 3 inferior points)
export const LEFT_EYE = {
  cornerOuter: 33,   // Lateral canthus
  cornerInner: 133,  // Medial canthus
  topOuter: 160,
  topCenter: 159,    // Superior eyelid apex
  topInner: 158,
  bottomOuter: 144,
  bottomCenter: 145, // Inferior eyelid nadir
  bottomInner: 153,
};

export const RIGHT_EYE = {
  cornerInner: 362,  // Medial canthus
  cornerOuter: 263,  // Lateral canthus
  topInner: 385,
  topCenter: 386,    // Superior eyelid apex
  topOuter: 387,
  bottomInner: 380,
  bottomCenter: 374, // Inferior eyelid nadir
  bottomOuter: 373,
};

function euclideanDist(p1: NormalizedLandmark, p2: NormalizedLandmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isValidEyePoint(p: NormalizedLandmark | undefined): p is NormalizedLandmark {
  if (!p) return false;
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= 0.01 &&
    p.x <= 0.99 &&
    p.y >= 0.01 &&
    p.y <= 0.99
  );
}

/**
 * 3-segment vertical Eye Aspect Ratio (EAR) normalized by horizontal eye width.
 * Formula: (d_outer + 2.0 * d_center + d_inner) / (4.0 * d_horizontal)
 * Lower value = more closed eye; higher value = more open eye.
 */
export function calculateEyeEAR(
  landmarks: NormalizedLandmark[],
  idx: typeof LEFT_EYE
): { ear: number; verticalApex: number; width: number; landmarksValid: boolean } {
  const pOuter = landmarks[idx.cornerOuter];
  const pInner = landmarks[idx.cornerInner];
  const pTop1 = landmarks[idx.topOuter];
  const pTop2 = landmarks[idx.topCenter];
  const pTop3 = landmarks[idx.topInner];
  const pBottom1 = landmarks[idx.bottomOuter];
  const pBottom2 = landmarks[idx.bottomCenter];
  const pBottom3 = landmarks[idx.bottomInner];

  if (
    !isValidEyePoint(pOuter) ||
    !isValidEyePoint(pInner) ||
    !isValidEyePoint(pTop1) ||
    !isValidEyePoint(pTop2) ||
    !isValidEyePoint(pTop3) ||
    !isValidEyePoint(pBottom1) ||
    !isValidEyePoint(pBottom2) ||
    !isValidEyePoint(pBottom3)
  ) {
    return { ear: 0, verticalApex: 0, width: 0, landmarksValid: false };
  }

  // Ensure superior eyelid points are not inverted below inferior eyelid points by noise
  const d1 = euclideanDist(pTop1, pBottom1);
  const d2 = euclideanDist(pTop2, pBottom2); // center apex
  const d3 = euclideanDist(pTop3, pBottom3);
  const dHoriz = euclideanDist(pOuter, pInner);

  if (dHoriz <= 0.005) return { ear: 0, verticalApex: 0, width: 0, landmarksValid: false };
  const ear = (d1 + 2.0 * d2 + d3) / (4.0 * dHoriz);
  return { ear, verticalApex: d2 / dHoriz, width: dHoriz, landmarksValid: true };
}

export interface ValidatedBlinkEvent {
  id: string;
  timestamp: number;
  durationMs: number;
  type: BlinkType;
  confidence: number;
  leftOpeningApex: number;
  rightOpeningApex: number;
  minOpeningEAR: number;
  baselineOpening: number;
  closureThresholdEAR: number;
  reopenThresholdEAR: number;
}

export interface BlinkDetectionResult {
  ear: number;
  isBlinkEvent: boolean;
  blinkEvent?: ValidatedBlinkEvent;
  totalBlinks: number;
  fullBlinks: number;
  partialBlinks: number;
  /** Session average blink rate (BPM) = validated blinks ÷ valid observed monitoring time in minutes */
  avgBlinkRate: number | null;
  /** Rolling 60s blink rate (BPM) */
  rollingBlinkRate: number | null;
  currentBlinkRate: number | null;
  state: BlinkState;
  leftEyeOpening: number;
  rightEyeOpening: number;
  combinedOpening: number;
  baselineOpening: number;
  closureThresholdEAR: number;
  reopenThresholdEAR: number;
  fullClosureThresholdEAR: number;
  eyeClosureScore: number;
  confidence: number;
  isReliable: boolean;
  trackingQuality: 'High' | 'Moderate' | 'Low' | 'Lost';
  headPose: { yaw: number; pitch: number; roll: number };
  lastBlinkTime: number | null;
  lastBlinkDurationMs?: number;
  lastBlinkType?: BlinkType;
  candidateLogs: BlinkCandidateLog[];
}

export interface FrameSample {
  timestamp: number;
  leftEAR: number;
  rightEAR: number;
  combinedEAR: number;
  rawCombinedEAR: number;
  closureScore: number;
}

export class BlinkDetector {
  private readonly config: BlinkDetectorConfig;
  private state: BlinkState = 'CALIBRATING';

  // Adaptive baseline aperture (calibrated to the user's natural open eyes)
  private leftBaselineEAR: number;
  private rightBaselineEAR: number;
  private baselineEAR: number;
  private restingBlendshape = 0.04;
  private calibrationFrames = 0;
  private calibrationSamples: number[] = [];
  private leftCalibrationSamples: number[] = [];
  private rightCalibrationSamples: number[] = [];
  private isCalibrated = false;

  // Real-time minimal-smoothing eye measurements
  private smoothedLeftEAR: number;
  private smoothedRightEAR: number;
  private smoothedEAR: number;

  // Rolling window of recent open-eye EAR values for bidirectional steady-state baseline adaptation
  private recentOpenSamples: Array<{ ear: number; left: number; right: number }> = [];
  private prevHeadPose: { yaw: number; pitch: number; roll: number } | null = null;

  // Temporal tracking buffer for velocity & trajectory validation
  private frameBuffer: FrameSample[] = [];
  private readonly bufferCapacity = 24;

  // State machine transition timers and closure phase tracking
  private stateChangeTime = 0;
  private lastOpenFrameTimestamp = 0;
  private closingStartTime = 0;
  private closedPhaseTime = 0;
  private closedFrameCount = 0;
  private maxClosureReached = 0;
  private minEARReached = 1.0;
  private minRawEARReached = 1.0;
  private minLeftEARReached = 1.0;
  private minRightEARReached = 1.0;
  private maxSingleEyeDropRatio = 0;
  private minPartnerEyeDropRatio = 0;
  private hasEnteredClosedPhase = false;
  private lastProcessedTimestamp = 0;

  // Authoritative blink event registry (single source of truth for session total, graph, and rate)
  private totalBlinks = 0;
  private fullBlinks = 0;
  private partialBlinks = 0;
  private validatedEvents: ValidatedBlinkEvent[] = [];
  private blinkTimestamps: number[] = [];
  private candidateLogs: BlinkCandidateLog[] = [];
  private lastBlinkTime: number | null = null;
  private lastBlinkDurationMs = 0;
  private lastBlinkType: BlinkType = 'Full';
  private lastBlinkConfidence = 1.0;

  constructor(
    initialBaseline = DEFAULT_BLINK_CONFIG.defaultBaselineEAR,
    customConfig?: Partial<BlinkDetectorConfig>
  ) {
    this.config = { ...DEFAULT_BLINK_CONFIG, ...customConfig };
    const clamped = Math.max(
      this.config.minBaselineEAR,
      Math.min(this.config.maxBaselineEAR, initialBaseline)
    );
    this.baselineEAR = clamped;
    this.leftBaselineEAR = clamped;
    this.rightBaselineEAR = clamped;
    this.smoothedEAR = clamped;
    this.smoothedLeftEAR = clamped;
    this.smoothedRightEAR = clamped;
  }

  public getConfig(): BlinkDetectorConfig {
    return { ...this.config };
  }

  public getThresholds(): BlinkThresholdSnapshot {
    return computeBlinkThresholds(this.baselineEAR, this.config);
  }

  public setBaseline(baseline: number): void {
    if (baseline >= this.config.minBaselineEAR && baseline <= 0.45) {
      const clamped = Math.min(this.config.maxBaselineEAR, baseline);
      this.baselineEAR = clamped;
      this.leftBaselineEAR = clamped;
      this.rightBaselineEAR = clamped;
      this.smoothedEAR = clamped;
      this.smoothedLeftEAR = clamped;
      this.smoothedRightEAR = clamped;
      this.isCalibrated = true;
      if (this.state === 'CALIBRATING') {
        this.state = 'OPEN';
      }
    }
  }

  public getBaseline(): number {
    return this.baselineEAR;
  }

  public getCandidateLogs(): BlinkCandidateLog[] {
    return [...this.candidateLogs];
  }

  private recordCandidateLog(
    timestamp: number,
    durationMs: number,
    minEAR: number,
    baselineEAR: number,
    outcome: 'ACCEPTED' | 'REJECTED',
    reason: string,
    blinkType?: BlinkType
  ): void {
    const dropPct =
      baselineEAR > 0
        ? Number((Math.max(0, (baselineEAR - minEAR) / baselineEAR) * 100).toFixed(1))
        : 0;
    const entry: BlinkCandidateLog = {
      id: `cand-${Date.now()}-${this.candidateLogs.length + 1}`,
      timestamp,
      timeStr: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      durationMs: Math.max(0, Math.round(durationMs)),
      minEAR: Number(minEAR.toFixed(3)),
      baselineEAR: Number(baselineEAR.toFixed(3)),
      dropPct,
      outcome,
      blinkType,
      reason,
    };
    this.candidateLogs.unshift(entry);
    if (this.candidateLogs.length > 50) {
      this.candidateLogs.pop();
    }
  }

  /**
   * Aborts an in-progress closure cycle without counting a blink.
   * Called when tracking is lost, measurements become unreliable, or camera pauses.
   */
  private abortCurrentCycle(timestamp = 0, reason?: string): void {
    if (this.hasEnteredClosedPhase && reason && timestamp > 0) {
      const dur = this.closingStartTime > 0 ? timestamp - this.closingStartTime : 0;
      this.recordCandidateLog(
        timestamp,
        dur,
        this.minEARReached,
        this.baselineEAR,
        'REJECTED',
        reason
      );
    }
    if (this.state !== 'CALIBRATING') {
      this.state = 'OPEN';
    }
    this.stateChangeTime = timestamp;
    this.closingStartTime = 0;
    this.closedPhaseTime = 0;
    this.closedFrameCount = 0;
    this.maxClosureReached = 0;
    this.minEARReached = this.baselineEAR;
    this.minRawEARReached = this.baselineEAR;
    this.minLeftEARReached = this.leftBaselineEAR;
    this.minRightEARReached = this.rightBaselineEAR;
    this.maxSingleEyeDropRatio = 0;
    this.minPartnerEyeDropRatio = 0;
    this.hasEnteredClosedPhase = false;
  }

  /**
   * Safely resets transient detection state when camera is paused, tracking is lost,
   * the face leaves the frame, or the camera resumes — without erasing validated session counts.
   */
  public resetTransientState(): void {
    this.abortCurrentCycle(0);
    this.frameBuffer = [];
    this.recentOpenSamples = [];
    this.prevHeadPose = null;
    this.lastProcessedTimestamp = 0;
    this.lastOpenFrameTimestamp = 0;
    this.smoothedEAR = this.baselineEAR;
    this.smoothedLeftEAR = this.leftBaselineEAR;
    this.smoothedRightEAR = this.rightBaselineEAR;
  }

  /**
   * Process a single video frame with MediaPipe facial landmarks, neural blendshapes, and head pose.
   * Uses a calibrated relative two-threshold hysteresis state machine and real frame timestamps.
   */
  public processLandmarks(
    landmarks: NormalizedLandmark[] | null,
    timestamp = performance.now(),
    blendshapes?: Record<string, number>,
    headPose = { yaw: 0, pitch: 0, roll: 0 },
    validObservationSeconds = 0
  ): BlinkDetectionResult {
    // Detect large frame gap (e.g. camera paused & resumed or tab backgrounded > 750ms)
    if (this.lastProcessedTimestamp > 0 && timestamp - this.lastProcessedTimestamp > 750) {
      this.abortCurrentCycle(timestamp, 'Rejected: Frame interval gap > 750ms');
      this.lastOpenFrameTimestamp = 0;
    }
    const frameDeltaMs =
      this.lastProcessedTimestamp > 0
        ? Math.max(8, Math.min(120, timestamp - this.lastProcessedTimestamp))
        : 33;
    this.lastProcessedTimestamp = timestamp;

    const thresholds = this.getThresholds();

    // 1. Check for face landmark availability
    if (!landmarks || landmarks.length < 468) {
      this.abortCurrentCycle(timestamp, 'Rejected: Face landmarks lost during closure');
      const avgRate = this.getAverageBlinkRate(validObservationSeconds);
      const rollingRate = this.getRollingBlinkRate(timestamp, validObservationSeconds);
      return {
        isBlinkEvent: false,
        totalBlinks: this.totalBlinks,
        fullBlinks: this.fullBlinks,
        partialBlinks: this.partialBlinks,
        avgBlinkRate: avgRate,
        rollingBlinkRate: rollingRate,
        currentBlinkRate: avgRate,
        state: this.state,
        ear: 0,
        leftEyeOpening: 0,
        rightEyeOpening: 0,
        combinedOpening: 0,
        baselineOpening: thresholds.baselineEAR,
        closureThresholdEAR: thresholds.closureThresholdEAR,
        reopenThresholdEAR: thresholds.reopenThresholdEAR,
        fullClosureThresholdEAR: thresholds.fullClosureThresholdEAR,
        eyeClosureScore: 0,
        confidence: 0,
        isReliable: false,
        trackingQuality: 'Lost',
        headPose,
        lastBlinkTime: this.lastBlinkTime,
        lastBlinkDurationMs: this.lastBlinkDurationMs,
        lastBlinkType: this.lastBlinkType,
        candidateLogs: this.candidateLogs,
      };
    }

    // 2. Evaluate head pose, rapid head-motion jump, and per-eye landmark reliability
    const absYaw = Math.abs(headPose.yaw);
    const absPitch = Math.abs(headPose.pitch);
    const absRoll = Math.abs(headPose.roll);
    const isExtremePose = absYaw > 32 || absPitch > 28 || absRoll > 30;

    // Check for sudden single-frame head rotation jump (>= 9° yaw or >= 8° pitch in 1 frame) that can distort 2D landmarks
    const isSuddenHeadJump =
      this.prevHeadPose !== null &&
      (Math.abs(headPose.yaw - this.prevHeadPose.yaw) >= 9 ||
        Math.abs(headPose.pitch - this.prevHeadPose.pitch) >= 8);
    this.prevHeadPose = { ...headPose };

    const leftCalc = calculateEyeEAR(landmarks, LEFT_EYE);
    const rightCalc = calculateEyeEAR(landmarks, RIGHT_EYE);

    const isLeftValid =
      leftCalc.landmarksValid &&
      leftCalc.ear >= 0.035 &&
      leftCalc.ear <= 0.52 &&
      leftCalc.width >= 0.012;
    const isRightValid =
      rightCalc.landmarksValid &&
      rightCalc.ear >= 0.035 &&
      rightCalc.ear <= 0.52 &&
      rightCalc.width >= 0.012;

    // Allow one eye to provide supporting evidence when the other eye is temporarily degraded
    // (e.g. eyeglass glare or moderate head yaw), provided the active eye has strong geometry.
    const singleEyeHighQuality =
      (isLeftValid && leftCalc.width >= 0.016 && absYaw <= 26) ||
      (isRightValid && rightCalc.width >= 0.016 && absYaw <= 26);

    if (isExtremePose || isSuddenHeadJump || (!isLeftValid && !isRightValid) || (!(isLeftValid && isRightValid) && !singleEyeHighQuality)) {
      this.abortCurrentCycle(
        timestamp,
        isSuddenHeadJump
          ? 'Rejected: Rapid head movement during candidate closure'
          : 'Rejected: Eye landmarks unreliable or out of bounds'
      );
      const avgRate = this.getAverageBlinkRate(validObservationSeconds);
      const rollingRate = this.getRollingBlinkRate(timestamp, validObservationSeconds);
      return {
        isBlinkEvent: false,
        totalBlinks: this.totalBlinks,
        fullBlinks: this.fullBlinks,
        partialBlinks: this.partialBlinks,
        avgBlinkRate: avgRate,
        rollingBlinkRate: rollingRate,
        currentBlinkRate: avgRate,
        state: this.state,
        ear: Number(this.smoothedEAR.toFixed(3)),
        leftEyeOpening: Number(this.smoothedLeftEAR.toFixed(3)),
        rightEyeOpening: Number(this.smoothedRightEAR.toFixed(3)),
        combinedOpening: Number(this.smoothedEAR.toFixed(3)),
        baselineOpening: thresholds.baselineEAR,
        closureThresholdEAR: thresholds.closureThresholdEAR,
        reopenThresholdEAR: thresholds.reopenThresholdEAR,
        fullClosureThresholdEAR: thresholds.fullClosureThresholdEAR,
        eyeClosureScore: 0,
        confidence: 0,
        isReliable: false,
        trackingQuality: 'Low',
        headPose,
        lastBlinkTime: this.lastBlinkTime,
        lastBlinkDurationMs: this.lastBlinkDurationMs,
        lastBlinkType: this.lastBlinkType,
        candidateLogs: this.candidateLogs,
      };
    }

    let trackingQuality: 'High' | 'Moderate' | 'Low' | 'Lost' = 'High';
    if (!isLeftValid || !isRightValid || absYaw > 16 || absPitch > 16) {
      trackingQuality = 'Moderate';
    }

    // Dynamic eye weighting based on head yaw for eyeglass/angle resilience
    let leftWeight = 0.5;
    let rightWeight = 0.5;
    if (!isRightValid) {
      leftWeight = 1.0;
      rightWeight = 0.0;
    } else if (!isLeftValid) {
      leftWeight = 0.0;
      rightWeight = 1.0;
    } else if (headPose.yaw > 8) {
      leftWeight = 0.65;
      rightWeight = 0.35;
    } else if (headPose.yaw < -8) {
      leftWeight = 0.35;
      rightWeight = 0.65;
    }

    let rawLeft = isLeftValid ? leftCalc.ear : rightCalc.ear;
    let rawRight = isRightValid ? rightCalc.ear : leftCalc.ear;

    // Downward gaze pitch compensation: when looking down (pitch > 6°), upper eyelids naturally lower
    if (headPose.pitch > 6) {
      const pitchFactor = Math.min(1.16, 1.0 + (headPose.pitch - 6) * 0.008);
      rawLeft *= pitchFactor;
      rawRight *= pitchFactor;
    }

    const rawCombinedEAR = rawLeft * leftWeight + rawRight * rightWeight;

    // 3. Minimal Temporal Smoothing
    // Fast downward response (alpha = 0.90) preserves quick 50-100ms shallow natural blinks without erasing valleys.
    // Smooth upward response (alpha = 0.78) restores open baseline cleanly.
    const alpha = rawCombinedEAR < this.smoothedEAR ? 0.90 : 0.78;
    this.smoothedLeftEAR = this.smoothedLeftEAR * (1 - alpha) + rawLeft * alpha;
    this.smoothedRightEAR = this.smoothedRightEAR * (1 - alpha) + rawRight * alpha;
    this.smoothedEAR = this.smoothedEAR * (1 - alpha) + rawCombinedEAR * alpha;

    // 4. Read optional MediaPipe neural blendshapes
    const blinkLeftScore = blendshapes?.['eyeBlinkLeft'];
    const blinkRightScore = blendshapes?.['eyeBlinkRight'];
    const hasBlendshapes =
      typeof blinkLeftScore === 'number' && typeof blinkRightScore === 'number';

    let blendshapeBlink = 0;
    if (hasBlendshapes) {
      blendshapeBlink = blinkLeftScore * leftWeight + blinkRightScore * rightWeight;
    }

    // 5. Personal Open-Eye Calibration & Bidirectional Guarded Baseline Adaptation
    if (this.state === 'CALIBRATING' || !this.isCalibrated) {
      if (!hasBlendshapes || blendshapeBlink < 0.22) {
        this.calibrationSamples.push(rawCombinedEAR);
        this.leftCalibrationSamples.push(rawLeft);
        this.rightCalibrationSamples.push(rawRight);
        this.calibrationFrames++;
      }
      if (this.calibrationFrames >= 10) {
        const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
        const sortedLeft = [...this.leftCalibrationSamples].sort((a, b) => a - b);
        const sortedRight = [...this.rightCalibrationSamples].sort((a, b) => a - b);
        // Use 55th percentile (trimmed median) of natural open-eye frames so wide-eye spikes do not inflate the baseline
        const idx55 = Math.floor(sorted.length * 0.55);
        this.baselineEAR = Math.max(
          this.config.minBaselineEAR,
          Math.min(this.config.maxBaselineEAR, sorted[idx55])
        );
        this.leftBaselineEAR = Math.max(
          this.config.minBaselineEAR,
          Math.min(this.config.maxBaselineEAR, sortedLeft[idx55] ?? this.baselineEAR)
        );
        this.rightBaselineEAR = Math.max(
          this.config.minBaselineEAR,
          Math.min(this.config.maxBaselineEAR, sortedRight[idx55] ?? this.baselineEAR)
        );
        if (hasBlendshapes) {
          this.restingBlendshape = Math.min(0.18, Math.max(0.02, blendshapeBlink));
        }
        this.isCalibrated = true;
        this.state = 'OPEN';
        this.stateChangeTime = timestamp;
        this.lastOpenFrameTimestamp = timestamp;
        this.calibrationSamples = [];
        this.leftCalibrationSamples = [];
        this.rightCalibrationSamples = [];
      }
    } else if (this.state === 'OPEN') {
      // Track steady open-eye frames to adapt slowly to lighting, posture, or relaxed eyelid level
      // without ever allowing a blink closure to pull down the baseline.
      const isPlausibleOpenEAR =
        rawCombinedEAR >= this.config.minBaselineEAR &&
        rawCombinedEAR <= this.config.maxBaselineEAR &&
        (!hasBlendshapes || blendshapeBlink < this.restingBlendshape + 0.10) &&
        absPitch < 16 &&
        absYaw < 18;

      if (isPlausibleOpenEAR) {
        this.recentOpenSamples.push({
          ear: rawCombinedEAR,
          left: rawLeft,
          right: rawRight,
        });
        if (this.recentOpenSamples.length > 10) {
          this.recentOpenSamples.shift();
        }

        // Check if the last 8 open frames have low variance (steady gaze, not blinking)
        if (this.recentOpenSamples.length >= 8) {
          const mean =
            this.recentOpenSamples.reduce((acc, s) => acc + s.ear, 0) /
            this.recentOpenSamples.length;
          const variance =
            this.recentOpenSamples.reduce((acc, s) => acc + (s.ear - mean) ** 2, 0) /
            this.recentOpenSamples.length;
          const stdDev = Math.sqrt(variance);

          // Only adapt when eyes are genuinely steady (stdDev < 0.011) and within reasonable range of baseline
          if (stdDev < 0.011 && mean >= this.baselineEAR * 0.86) {
            const adaptRate = mean >= this.baselineEAR ? 0.014 : 0.010;
            this.baselineEAR = Math.max(
              this.config.minBaselineEAR,
              Math.min(this.config.maxBaselineEAR, this.baselineEAR * (1 - adaptRate) + mean * adaptRate)
            );
            this.leftBaselineEAR = Math.max(
              this.config.minBaselineEAR,
              Math.min(
                this.config.maxBaselineEAR,
                this.leftBaselineEAR * (1 - adaptRate) + this.smoothedLeftEAR * adaptRate
              )
            );
            this.rightBaselineEAR = Math.max(
              this.config.minBaselineEAR,
              Math.min(
                this.config.maxBaselineEAR,
                this.rightBaselineEAR * (1 - adaptRate) + this.smoothedRightEAR * adaptRate
              )
            );
            if (hasBlendshapes) {
              this.restingBlendshape = this.restingBlendshape * 0.985 + blendshapeBlink * 0.015;
            }
          }
        }
      }
    }

    // Recompute live shared thresholds from current baseline
    const liveThresholds = this.getThresholds();
    const {
      baselineEAR,
      closureThresholdEAR,
      reopenThresholdEAR,
      fullClosureThresholdEAR,
    } = liveThresholds;

    // 6. Compute Relative Eyelid Reduction & Normalized Closure Score [0.0 = open, 1.0 = closed]
    const smoothedDropRatio = Math.max(0, (baselineEAR - this.smoothedEAR) / baselineEAR);
    const rawDropRatio = Math.max(0, (baselineEAR - rawCombinedEAR) / baselineEAR);
    const earDropRatio = Math.max(smoothedDropRatio, rawDropRatio * 0.94);

    const leftDropRatio = isLeftValid
      ? Math.max(0, (this.leftBaselineEAR - rawLeft) / this.leftBaselineEAR)
      : 0;
    const rightDropRatio = isRightValid
      ? Math.max(0, (this.rightBaselineEAR - rawRight) / this.rightBaselineEAR)
      : 0;

    // Asymmetric natural blink support:
    // Recognizes natural blinks where one eyelid closes by >= 15.5% and the partner eye
    // either drops by >= 8% or is temporarily occluded/untracked.
    const maxEyeDrop = Math.max(leftDropRatio, rightDropRatio);
    const minEyeDrop =
      isLeftValid && isRightValid
        ? Math.min(leftDropRatio, rightDropRatio)
        : maxEyeDrop;
    const isAsymmetricNaturalBlink =
      maxEyeDrop >= 0.155 && minEyeDrop >= 0.08;

    const blendshapeDelta = hasBlendshapes
      ? Math.max(0, blendshapeBlink - this.restingBlendshape)
      : 0;

    // Fuse neural blendshape evidence when concordant with geometric EAR reduction (>= 9% drop)
    const hasConcordantBlendshape =
      hasBlendshapes && blendshapeDelta >= 0.13 && earDropRatio >= 0.09;

    const earClosureScore = Math.min(1.0, earDropRatio / (1 - this.config.fullClosureRatio));
    const eyeClosureScore = hasConcordantBlendshape
      ? Math.min(1.0, Math.max(earClosureScore, blendshapeDelta * 1.35))
      : earClosureScore;

    // Compute unified effectiveEAR used by both the state machine and the live oscilloscope graph
    let effectiveEAR = Math.min(this.smoothedEAR, baselineEAR * (1 - earDropRatio));
    if (isAsymmetricNaturalBlink) {
      const asymmetricEquivalentEAR = baselineEAR * (1 - maxEyeDrop * 0.96);
      effectiveEAR = Math.min(effectiveEAR, asymmetricEquivalentEAR);
    }
    if (hasConcordantBlendshape) {
      const blendEquivalentEAR = baselineEAR * (1 - Math.max(earDropRatio, blendshapeDelta * 0.55));
      effectiveEAR = Math.min(effectiveEAR, blendEquivalentEAR);
    }

    // Record frame sample in rolling buffer
    this.frameBuffer.push({
      timestamp,
      leftEAR: this.smoothedLeftEAR,
      rightEAR: this.smoothedRightEAR,
      combinedEAR: effectiveEAR,
      rawCombinedEAR,
      closureScore: eyeClosureScore,
    });
    if (this.frameBuffer.length > this.bufferCapacity) {
      this.frameBuffer.shift();
    }

    // 7. Two-Threshold Hysteresis State Machine with Real Timestamp Validation
    // Sequence: OPEN -> CLOSING -> PARTIALLY_CLOSED / CLOSED -> REOPENING -> VALIDATED BLINK
    let isBlinkEvent = false;
    let committedEvent: ValidatedBlinkEvent | undefined;

    const isBelowClosureThreshold =
      effectiveEAR <= closureThresholdEAR ||
      earDropRatio >= 1 - this.config.closureThresholdRatio ||
      isAsymmetricNaturalBlink ||
      eyeClosureScore >= this.config.closureScoreThreshold;

    const isBelowFullClosureThreshold =
      effectiveEAR <= fullClosureThresholdEAR ||
      earDropRatio >= 1 - this.config.fullClosureRatio;

    // Reopen hysteresis condition: aperture must rise back up to reopenThresholdEAR
    const isAboveReopenThreshold =
      effectiveEAR >= reopenThresholdEAR && !isAsymmetricNaturalBlink;

    // Track last steady open timestamp while in OPEN state so closure duration is measured
    // from actual downward onset rather than only the bottom valley frame.
    if (this.state === 'OPEN' && !isBelowClosureThreshold && effectiveEAR >= reopenThresholdEAR) {
      this.lastOpenFrameTimestamp = timestamp;
    }

    const totalCycleTime = this.closingStartTime > 0 ? timestamp - this.closingStartTime : 0;

    switch (this.state) {
      case 'CALIBRATING':
        if (isBelowClosureThreshold) {
          this.isCalibrated = true;
          this.state = 'CLOSING';
          this.stateChangeTime = timestamp;
          const onsetTime =
            this.lastOpenFrameTimestamp > 0 && timestamp - this.lastOpenFrameTimestamp <= 110
              ? this.lastOpenFrameTimestamp
              : timestamp - Math.min(45, frameDeltaMs);
          this.closingStartTime = onsetTime;
          this.closedPhaseTime = timestamp;
          this.closedFrameCount = 1;
          this.hasEnteredClosedPhase = true;
          this.maxClosureReached = eyeClosureScore;
          this.minEARReached = effectiveEAR;
          this.minRawEARReached = rawCombinedEAR;
          this.minLeftEARReached = rawLeft;
          this.minRightEARReached = rawRight;
          this.maxSingleEyeDropRatio = maxEyeDrop;
          this.minPartnerEyeDropRatio = minEyeDrop;
        }
        break;

      case 'OPEN':
        if (isBelowClosureThreshold) {
          this.state = isBelowFullClosureThreshold ? 'CLOSED' : 'CLOSING';
          this.stateChangeTime = timestamp;
          // Anchor closure start to the last open frame immediately before descent (bounded <= 110ms)
          const onsetTime =
            this.lastOpenFrameTimestamp > 0 && timestamp - this.lastOpenFrameTimestamp <= 110
              ? this.lastOpenFrameTimestamp
              : timestamp - Math.min(45, frameDeltaMs);
          this.closingStartTime = onsetTime;
          this.closedPhaseTime = timestamp;
          this.closedFrameCount = 1;
          this.hasEnteredClosedPhase = true;
          this.maxClosureReached = eyeClosureScore;
          this.minEARReached = effectiveEAR;
          this.minRawEARReached = rawCombinedEAR;
          this.minLeftEARReached = rawLeft;
          this.minRightEARReached = rawRight;
          this.maxSingleEyeDropRatio = maxEyeDrop;
          this.minPartnerEyeDropRatio = minEyeDrop;
        }
        break;

      case 'CLOSING':
      case 'PARTIALLY_CLOSED':
      case 'CLOSED': {
        // Update extremum values reached during this closure phase
        if (eyeClosureScore > this.maxClosureReached) {
          this.maxClosureReached = eyeClosureScore;
        }
        if (effectiveEAR < this.minEARReached) {
          this.minEARReached = effectiveEAR;
        }
        if (rawCombinedEAR < this.minRawEARReached) {
          this.minRawEARReached = rawCombinedEAR;
        }
        if (rawLeft < this.minLeftEARReached) {
          this.minLeftEARReached = rawLeft;
        }
        if (rawRight < this.minRightEARReached) {
          this.minRightEARReached = rawRight;
        }
        if (maxEyeDrop > this.maxSingleEyeDropRatio) {
          this.maxSingleEyeDropRatio = maxEyeDrop;
        }
        if (minEyeDrop > this.minPartnerEyeDropRatio) {
          this.minPartnerEyeDropRatio = minEyeDrop;
        }

        if (effectiveEAR < reopenThresholdEAR) {
          this.closedFrameCount += 1;
        }

        // Check if eyes held closed beyond max spontaneous blink duration -> PROLONGED_CLOSURE
        if (totalCycleTime > this.config.maxBlinkDurationMs) {
          this.recordCandidateLog(
            timestamp,
            totalCycleTime,
            this.minEARReached,
            baselineEAR,
            'REJECTED',
            `Rejected: Prolonged eye closure (${Math.round(totalCycleTime)}ms > ${this.config.maxBlinkDurationMs}ms max)`
          );
          this.state = 'PROLONGED_CLOSURE';
          this.stateChangeTime = timestamp;
          this.hasEnteredClosedPhase = false;
          break;
        }

        // Advance sub-state within closed phase
        if (isBelowFullClosureThreshold && this.state !== 'CLOSED') {
          this.state = 'CLOSED';
          this.stateChangeTime = timestamp;
        } else if (
          this.state === 'CLOSING' &&
          this.closedFrameCount >= 1 &&
          !isBelowFullClosureThreshold
        ) {
          this.state = 'PARTIALLY_CLOSED';
          this.stateChangeTime = timestamp;
        }

        // Check Hysteresis Upper Threshold: has the eye reopened above reopenThresholdEAR?
        if (isAboveReopenThreshold) {
          this.state = 'REOPENING';
          this.stateChangeTime = timestamp;
          const blinkResult = this.evaluateAndCommitBlink(timestamp, liveThresholds);
          isBlinkEvent = blinkResult.isBlinkEvent;
          committedEvent = blinkResult.committedEvent;
          this.state = 'OPEN';
          this.stateChangeTime = timestamp;
          this.lastOpenFrameTimestamp = timestamp;
          this.closingStartTime = 0;
          this.closedFrameCount = 0;
          this.hasEnteredClosedPhase = false;
        }
        break;
      }

      case 'REOPENING': {
        if (totalCycleTime > this.config.maxBlinkDurationMs) {
          this.recordCandidateLog(
            timestamp,
            totalCycleTime,
            this.minEARReached,
            baselineEAR,
            'REJECTED',
            `Rejected: Prolonged eye closure (${Math.round(totalCycleTime)}ms > ${this.config.maxBlinkDurationMs}ms max)`
          );
          this.state = 'PROLONGED_CLOSURE';
          this.stateChangeTime = timestamp;
          this.hasEnteredClosedPhase = false;
        } else if (isAboveReopenThreshold) {
          const blinkResult = this.evaluateAndCommitBlink(timestamp, liveThresholds);
          isBlinkEvent = blinkResult.isBlinkEvent;
          committedEvent = blinkResult.committedEvent;
          this.state = 'OPEN';
          this.stateChangeTime = timestamp;
          this.lastOpenFrameTimestamp = timestamp;
          this.closingStartTime = 0;
          this.closedFrameCount = 0;
          this.hasEnteredClosedPhase = false;
        } else if (isBelowClosureThreshold) {
          // Dipped back below closure threshold before fully reopening -> stay in single closure
          this.state = isBelowFullClosureThreshold ? 'CLOSED' : 'PARTIALLY_CLOSED';
          this.closedFrameCount += 1;
        }
        break;
      }

      case 'PROLONGED_CLOSURE':
        // Prevent double-counting during continuous eye closure.
        // Remain in PROLONGED_CLOSURE until the user genuinely reopens above reopenThresholdEAR.
        if (isAboveReopenThreshold) {
          this.abortCurrentCycle(timestamp);
          this.lastOpenFrameTimestamp = timestamp;
        }
        break;
    }

    // 8. Prune rolling 60s blink timestamps
    const cutoff60s = timestamp - 60000;
    while (this.blinkTimestamps.length > 0 && this.blinkTimestamps[0] < cutoff60s) {
      this.blinkTimestamps.shift();
    }

    // 9. Calculate deterministic Session Average BPM and Rolling 60s BPM
    const avgBlinkRate = this.getAverageBlinkRate(validObservationSeconds);
    const rollingRate = this.getRollingBlinkRate(timestamp, validObservationSeconds);

    return {
      isBlinkEvent,
      blinkEvent: committedEvent,
      totalBlinks: this.totalBlinks,
      fullBlinks: this.fullBlinks,
      partialBlinks: this.partialBlinks,
      avgBlinkRate,
      rollingBlinkRate: rollingRate,
      currentBlinkRate: avgBlinkRate,
      state: this.state,
      leftEyeOpening: Number(this.smoothedLeftEAR.toFixed(3)),
      rightEyeOpening: Number(this.smoothedRightEAR.toFixed(3)),
      combinedOpening: Number(effectiveEAR.toFixed(3)),
      ear: Number(effectiveEAR.toFixed(3)),
      baselineOpening: baselineEAR,
      closureThresholdEAR,
      reopenThresholdEAR,
      fullClosureThresholdEAR,
      eyeClosureScore: Number(eyeClosureScore.toFixed(3)),
      confidence: this.lastBlinkConfidence,
      isReliable: true,
      trackingQuality,
      headPose,
      lastBlinkTime: this.lastBlinkTime,
      lastBlinkDurationMs: this.lastBlinkDurationMs,
      lastBlinkType: this.lastBlinkType,
      candidateLogs: this.candidateLogs,
    };
  }

  /**
   * Validates temporal window, relative drop, hysteresis sequence, and refractory period before committing a blink.
   * Logs diagnostic acceptance or rejection reason for every candidate event.
   */
  private evaluateAndCommitBlink(
    timestamp: number,
    thresholds: BlinkThresholdSnapshot
  ): { isBlinkEvent: boolean; committedEvent?: ValidatedBlinkEvent } {
    if (!this.hasEnteredClosedPhase || this.closingStartTime <= 0) {
      return { isBlinkEvent: false };
    }

    const duration = Math.max(1, timestamp - this.closingStartTime);
    const dropPct =
      thresholds.baselineEAR > 0
        ? ((thresholds.baselineEAR - this.minEARReached) / thresholds.baselineEAR) * 100
        : 0;

    // 1. Temporal duration window check: allows quick 50-100ms blinks (min 35ms from onset to reopen) up to 650ms
    if (duration < this.config.minBlinkDurationMs) {
      this.recordCandidateLog(
        timestamp,
        duration,
        this.minEARReached,
        thresholds.baselineEAR,
        'REJECTED',
        `Rejected: Sub-threshold duration (${Math.round(duration)}ms < ${this.config.minBlinkDurationMs}ms noise floor)`
      );
      return { isBlinkEvent: false };
    }

    if (duration > this.config.maxBlinkDurationMs) {
      this.recordCandidateLog(
        timestamp,
        duration,
        this.minEARReached,
        thresholds.baselineEAR,
        'REJECTED',
        `Rejected: Prolonged closure (${Math.round(duration)}ms > ${this.config.maxBlinkDurationMs}ms max)`
      );
      return { isBlinkEvent: false };
    }

    // 2. Verify relative eye-opening reduction reached closure threshold (or asymmetric/blendshape threshold)
    const isClosureReached =
      this.minEARReached <= thresholds.closureThresholdEAR ||
      this.maxSingleEyeDropRatio >= 0.155 ||
      this.maxClosureReached >= this.config.closureScoreThreshold;

    if (!isClosureReached) {
      this.recordCandidateLog(
        timestamp,
        duration,
        this.minEARReached,
        thresholds.baselineEAR,
        'REJECTED',
        `Rejected: Insufficient relative EAR drop (${dropPct.toFixed(1)}% < 15.5% threshold)`
      );
      return { isBlinkEvent: false };
    }

    // 3. Refractory period check: prevents duplicate counts from eyelid bounce while allowing rapid double blinks
    const isRefractoryClear =
      this.lastBlinkTime === null ||
      timestamp - this.lastBlinkTime >= this.config.minInterBlinkIntervalMs;

    if (!isRefractoryClear) {
      const gap = this.lastBlinkTime !== null ? Math.round(timestamp - this.lastBlinkTime) : 0;
      this.recordCandidateLog(
        timestamp,
        duration,
        this.minEARReached,
        thresholds.baselineEAR,
        'REJECTED',
        `Rejected: Refractory duplicate protection (${gap}ms < ${this.config.minInterBlinkIntervalMs}ms min interval)`
      );
      return { isBlinkEvent: false };
    }

    // Candidate passed all checks -> Commit single validated blink event
    this.totalBlinks += 1;
    const finalType: BlinkType =
      this.minEARReached <= thresholds.fullClosureThresholdEAR ||
      dropPct >= (1 - this.config.fullClosureRatio) * 100 ||
      this.maxClosureReached >= 0.88
        ? 'Full'
        : 'Partial';

    if (finalType === 'Full') {
      this.fullBlinks += 1;
    } else {
      this.partialBlinks += 1;
    }

    this.lastBlinkTime = timestamp;
    this.lastBlinkDurationMs = Math.round(duration);
    this.lastBlinkType = finalType;
    this.blinkTimestamps.push(timestamp);

    const confidence = Math.min(
      1.0,
      Math.max(0.80, Number((0.75 + Math.min(0.25, this.maxClosureReached * 0.40)).toFixed(2)))
    );
    this.lastBlinkConfidence = confidence;

    const committedEvent: ValidatedBlinkEvent = {
      id: `blink-${Date.now()}-${this.totalBlinks}`,
      timestamp,
      durationMs: Math.round(duration),
      type: finalType,
      confidence,
      leftOpeningApex: Number(this.minLeftEARReached.toFixed(3)),
      rightOpeningApex: Number(this.minRightEARReached.toFixed(3)),
      minOpeningEAR: Number(this.minEARReached.toFixed(3)),
      baselineOpening: thresholds.baselineEAR,
      closureThresholdEAR: thresholds.closureThresholdEAR,
      reopenThresholdEAR: thresholds.reopenThresholdEAR,
    };

    this.validatedEvents.push(committedEvent);
    if (this.validatedEvents.length > 200) {
      this.validatedEvents.shift();
    }

    this.recordCandidateLog(
      timestamp,
      duration,
      this.minEARReached,
      thresholds.baselineEAR,
      'ACCEPTED',
      `Accepted (${finalType}): ${dropPct.toFixed(1)}% relative EAR reduction over ${Math.round(duration)}ms`,
      finalType
    );

    return { isBlinkEvent: true, committedEvent };
  }

  /**
   * Authoritative Session Average Blink Rate (BPM):
   * Formula: validated blinks ÷ eligible observed monitoring time in minutes.
   * Returns null until valid observed monitoring time >= minObservationSecondsForBpm (5s).
   */
  public getAverageBlinkRate(validObservationSeconds: number): number | null {
    if (
      !Number.isFinite(validObservationSeconds) ||
      validObservationSeconds < this.config.minObservationSecondsForBpm
    ) {
      return null;
    }

    const validObservedMinutes = validObservationSeconds / 60;
    if (validObservedMinutes <= 0) {
      return null;
    }

    const bpm = this.totalBlinks / validObservedMinutes;
    return Math.min(60, Math.max(0, Math.round(bpm)));
  }

  /**
   * Rolling 60-second Blink Rate (BPM) calculated from timestamps within the last 60s window.
   */
  public getRollingBlinkRate(now = performance.now(), validObservationSeconds = 0): number | null {
    if (
      !Number.isFinite(validObservationSeconds) ||
      validObservationSeconds < this.config.minObservationSecondsForBpm
    ) {
      return null;
    }
    const windowSec = Math.min(60, validObservationSeconds);
    if (windowSec <= 0) return null;

    const cutoff = now - 60000;
    let recentCount = 0;
    for (let i = this.blinkTimestamps.length - 1; i >= 0; i--) {
      if (this.blinkTimestamps[i] >= cutoff) {
        recentCount++;
      } else {
        break;
      }
    }
    const rollingBpm = recentCount / (windowSec / 60);
    return Math.min(60, Math.max(0, Math.round(rollingBpm)));
  }

  public getValidatedEvents(): ValidatedBlinkEvent[] {
    return [...this.validatedEvents];
  }

  public getTotalBlinks(): number {
    return this.totalBlinks;
  }

  public getFullBlinks(): number {
    return this.fullBlinks;
  }

  public getPartialBlinks(): number {
    return this.partialBlinks;
  }

  public reset(): void {
    this.state = 'CALIBRATING';
    this.totalBlinks = 0;
    this.fullBlinks = 0;
    this.partialBlinks = 0;
    this.validatedEvents = [];
    this.blinkTimestamps = [];
    this.candidateLogs = [];
    this.recentOpenSamples = [];
    this.prevHeadPose = null;
    this.lastBlinkTime = null;
    this.lastBlinkDurationMs = 0;
    this.stateChangeTime = 0;
    this.lastOpenFrameTimestamp = 0;
    this.closingStartTime = 0;
    this.closedPhaseTime = 0;
    this.closedFrameCount = 0;
    this.maxClosureReached = 0;
    this.minEARReached = this.baselineEAR;
    this.minRawEARReached = this.baselineEAR;
    this.minLeftEARReached = this.leftBaselineEAR;
    this.minRightEARReached = this.rightBaselineEAR;
    this.maxSingleEyeDropRatio = 0;
    this.minPartnerEyeDropRatio = 0;
    this.hasEnteredClosedPhase = false;
  }
}
