export type ActiveTab = 'dashboard' | 'ocure' | 'retis' | 'logs';

export type BehaviorMode = 'gaming' | 'default' | 'meeting';

export interface BlinkCandidateLog {
  id: string;
  timestamp: number;
  timeStr: string;
  durationMs: number;
  minEAR: number;
  baselineEAR: number;
  dropPct: number;
  outcome: 'ACCEPTED' | 'REJECTED';
  blinkType?: 'Full' | 'Partial';
  reason: string;
}

export type MonitoringState =
  | 'STARTING'
  | 'ACTIVE'
  | 'NO_FACE'
  | 'CAMERA_BLOCKED'
  | 'CAMERA_BUSY'
  | 'PAUSED'
  | 'ERROR';

export type EyeDetectionState =
  | 'Eyes detected'
  | 'Eyes not detected'
  | 'Detection unavailable';

export interface TelemetryState {
  avgBlinkRate: number | null; // Session average blink rate (BPM) = validated blinks ÷ valid observed monitoring time in minutes (null if < 5s)
  rollingBlinkRate?: number | null; // Rolling 60s blink rate (BPM)
  blinkTargetMin: number;
  blinkTargetMax: number;
  avgScreenDistance: number | null; // calibrated relative distance in cm, or null if uncalibrated/no face
  distanceOptimal: number;
  vergenceStatus: 'GOOD' | 'FAIR' | 'STRAIN' | 'UNKNOWN';
  dayProgress: number; // calculated from actual breaks taken today vs target
  fatigueScore: number | null; // derived workload load score from valid observation
  dayCount: number;
  activeMode: BehaviorMode;
  gazePointsAudited: number;
  blinkAlerts: number;
  distanceAlerts: number;
  screenTimeHours: number;
  longestSessionHours: number;
  cameraFps: number;
  nextBreakSeconds: number;
  isCalibrated: boolean;
  isMonitoring: boolean;
  monitoringState?: MonitoringState;
  eyeDetectionState?: EyeDetectionState;
  faceDetected: boolean;
  isReliable?: boolean;
  observationSeconds: number;
  totalMonitoringSeconds?: number;
  trackingCoveragePct?: number;
  totalBlinksDetected: number;
  fullBlinksDetected?: number;
  partialBlinksDetected?: number;
  leftEyeAperture?: number;
  rightEyeAperture?: number;
  combinedAperture?: number;
  baselineAperture?: number;
  closureThresholdEAR?: number;
  reopenThresholdEAR?: number;
  fullClosureThresholdEAR?: number;
  eyeClosureScore?: number;
  blinkState?: string;
  blinkConfidence?: number;
  lastBlinkTimestamp?: number | null;
  lastBlinkDurationMs?: number;
  lastBlinkType?: 'Full' | 'Partial';
  trackingQuality?: 'High' | 'Moderate' | 'Low' | 'Lost';
  headPose?: { yaw: number; pitch: number; roll: number };
  gazeHorizontal?: number; // Normalized left/right gaze offset [-1..1] from iris landmarks & blendshapes
  gazeVertical?: number; // Normalized down/up gaze offset [-1..1] from iris landmarks & blendshapes
  postureY?: number; // Normalized vertical chin/nose landmark position [0..1] for shoulder/breathing detection
  jawRelaxScore?: number; // Normalized jaw unclench/open score [0..1]
  browTensionScore?: number; // Normalized brow furrow score [0..1]
  faceObscured?: boolean; // True when facial landmarks are partially occluded or low-visibility
  screenDistanceCm?: number | null;
  interOcularRatio?: number | null;
  faceWidthRatio?: number | null;
  candidateLogs?: BlinkCandidateLog[];
}

export interface BlinkDebugSample {
  timestamp: number;
  timeStr: string;
  leftEyeOpening: number;
  rightEyeOpening: number;
  baselineOpening: number;
  closureScore: number;
  state: string;
  isBlink: boolean;
  blinkType?: 'Full' | 'Partial';
  confidence: number;
  yaw: number;
  pitch: number;
  roll: number;
  trackingQuality: 'High' | 'Moderate' | 'Low' | 'Lost';
}

export interface EyeBreakLog {
  id: string;
  time: string;
  type: string;
  durationSeconds: number;
  complianceScore: number;
  status: 'Completed' | 'Skipped' | 'Partial' | 'Active' | 'Warning';
  telemetrySnapshot?: {
    blinkRate?: number | null;
    distanceCm?: number | null;
    fatigueScore?: number | null;
  };
  notes?: string;
}

export type CameraStatus =
  | 'idle'
  | 'requesting_permission'
  | 'initializing'
  | 'running'
  | 'calibrating'
  | 'paused'
  | 'stopping'
  | 'error';

export interface VisionTelemetry {
  isTracking: boolean;
  faceDetected: boolean;
  ear: number;
  blinksThisMinute: number;
  rollingBlinkRate: number;
  totalBlinks: number;
  lastBlinkTime: number | null;
  estimatedDistanceCm: number | null;
  isProximityAlert: boolean;
  headPose: { yaw: number; pitch: number; roll: number };
  fps: number;
  isCalibrated: boolean;
  trackingQuality: 'High' | 'Moderate' | 'Low' | 'Lost';
}

export interface CalibrationData {
  baselineEAR: number;
  baselineFaceWidth: number;
  referenceDistanceCm: number;
  calibratedAt: number;
  calibrationVersion?: number;
  normalizedFacePosition?: { x: number; y: number };
  interOcularDistance?: number;
  eyeLevelY?: number;
  relativeDistanceBaseline?: number;
  calibrationValid?: boolean;
}

export type CameraPermissionState =
  | 'Permission not requested'
  | 'Requesting permission'
  | 'Permission granted'
  | 'Permission denied'
  | 'Camera blocked'
  | 'Camera unavailable'
  | 'Camera in use by another application'
  | 'Camera initialization failed'
  | 'Monitoring active';

export interface StoredAggregateTelemetry {
  timestamp: number;
  timeLabel: string;
  durationSeconds: number;
  blinksDetected: number;
  avgBlinkRate: number;
  avgDistanceCm: number;
  proximityAlertsCount: number;
  trackingQualityPct: number;
}

export type RetisMetricId =
  | 'blink_rate_bpm'
  | 'validated_blinks'
  | 'total_validated_blinks'
  | 'observed_duration'
  | 'tracking_coverage'
  | 'avg_distance_cm'
  | 'screen_distance_cm'
  | 'calibration_status'
  | 'blink_alerts'
  | 'blink_alerts_count'
  | 'distance_warnings'
  | 'distance_warnings_count'
  | 'alerts_delivered'
  | 'longest_session'
  | 'longest_session_hours'
  | 'fatigue_score'
  | 'completed_breaks'
  | 'completed_breaks_count'
  | 'recommended_exercises'
  | 'seven_day_avg_blink_rate'
  | 'seven_day_avg_distance_cm'
  | 'active_days_count'
  | 'tracked_days_count';

export type RetisSuggestedAction =
  | 'start_break'
  | 'view_heatmap'
  | 'view_trends'
  | 'download_report'
  | 'none';

export type RetisConnectionState =
  | 'not_configured'
  | 'connected'
  | 'offline'
  | 'error'
  | 'standby'
  | 'live_voice';

export interface RetisStructuredResponse {
  answer: string;
  answer_template: string;
  metrics_used: RetisMetricId[];
  data_period: string;
  data_limitations: string;
  out_of_scope: boolean;
  suggested_action: RetisSuggestedAction;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  createdAt?: string;
  isOffTopic?: boolean;
  isError?: boolean;
  isVoice?: boolean;
  isFreshReply?: boolean;
  retryQuery?: string;
  retryMetricId?: RetisMetricId;
  frozenMetrics?: Record<string, { label: string; value: string }>;
  interrupted?: boolean;
  source?: 'model' | 'local';
  structured?: {
    answer: string;
    answerTemplate: string;
    metricsUsed: RetisMetricId[];
    dataPeriod: string;
    observedDurationLabel: string;
    dataLimitations: string;
    outOfScope: boolean;
    suggestedAction: RetisSuggestedAction;
    source?: 'model' | 'local';
    interrupted?: boolean;
  };
}

export interface RetisChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface DailyTelemetryRecord {
  date: string;
  day: string;
  formattedDate: string;
  timestamp: number;
  fatigue: number;
  blinkRate: number;
  distanceCm: number;
  screenHours: number;
  compliance: number;
  note: string;
}

export interface LiveTelemetryPoint {
  id: string;
  timestamp: number;
  timeStr: string;
  blinkRate: number;
  distanceCm: number;
  fatigueScore: number;
  ear?: number;
}

export interface HourlyTelemetryRecord {
  hourKey: string; // e.g. "2026-10-16-14"
  timestamp: number;
  hourLabel: string; // e.g. "2pm - 3pm"
  avgBlinkRate: number;
  avgDistanceCm: number;
  totalBlinks: number;
  monitoredMinutes: number;
}

export type OnboardingStep =
  | 'welcome'
  | 'privacy'
  | 'cameraPermission'
  | 'facePositioning'
  | 'eyeAlignment'
  | 'calibration'
  | 'complete';

export interface OnboardingState {
  step: OnboardingStep;
  privacyAcknowledged: boolean;
  cameraPermissionState: CameraPermissionState;
  faceReady: boolean;
  eyeAlignmentReady: boolean;
  calibrationSucceeded: boolean;
  calibrationSaved: boolean;
}
