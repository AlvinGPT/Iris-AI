import {
  TelemetryState,
  DailyTelemetryRecord,
  HourlyTelemetryRecord,
  LiveTelemetryPoint,
  EyeBreakLog,
  RetisMetricId,
  RetisSuggestedAction,
  RetisStructuredResponse,
} from '../types';
import { TelemetryStorageService } from './telemetryStorage';
import { RETIS_OUT_OF_SCOPE_REDIRECT_TEXT } from '../constants/retisSystemInstruction';

export const ALLOWED_RETIS_METRIC_IDS: readonly RetisMetricId[] = [
  'blink_rate_bpm',
  'validated_blinks',
  'total_validated_blinks',
  'observed_duration',
  'tracking_coverage',
  'avg_distance_cm',
  'screen_distance_cm',
  'calibration_status',
  'blink_alerts',
  'blink_alerts_count',
  'distance_warnings',
  'distance_warnings_count',
  'alerts_delivered',
  'longest_session',
  'longest_session_hours',
  'fatigue_score',
  'completed_breaks',
  'completed_breaks_count',
  'recommended_exercises',
  'seven_day_avg_blink_rate',
  'seven_day_avg_distance_cm',
  'active_days_count',
  'tracked_days_count',
] as const;

export const ALLOWED_RETIS_ACTIONS: readonly RetisSuggestedAction[] = [
  'start_break',
  'view_heatmap',
  'view_trends',
  'download_report',
  'none',
] as const;

export const TELEMETRY_STALENESS_THRESHOLD_SECONDS = 30;

export type MetricDataState =
  | 'live'
  | 'paused'
  | 'measured_zero'
  | 'insufficient_data'
  | 'uncalibrated'
  | 'no_face'
  | 'no_data'
  | 'unavailable';

export interface SnapshotMetricEntry<T = number | string | null> {
  id: RetisMetricId;
  label: string;
  rawValue: T;
  formattedValue: string;
  unit: string;
  state: MetricDataState;
  statusBadge: string;
  unavailableReason: string | null;
  measurementTimestamp?: number;
  ageSeconds?: number;
  isStaleOrUnavailable?: boolean;
  isReliable?: boolean;
  observedTimeBasisSeconds?: number;
}

export interface HeatmapCell {
  dateStr: string;
  dayLabel: string;
  hour: number;
  hourLabel: string;
  hasData: boolean;
  lowBlinkWindows: number;
  distanceWarnings: number;
  avgBlinkRate: number | null;
  avgDistanceCm: number | null;
  monitoredMinutes: number;
}

export interface DailyTrendPoint {
  date: string;
  day: string;
  formattedDate: string;
  hasData: boolean;
  blinkRate: number | null;
  distanceCm: number | null;
  distanceWarnings: number | null;
  totalValidatedBlinks: number | null;
  fatigue: number | null;
  screenHours: number | null;
  compliance: number | null;
}

export interface RetisAggregateSnapshotPayload {
  reportingPeriod: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  retentionWindowDays: number;
  monitoringStatus: 'live' | 'paused' | 'no_face' | 'camera_unavailable';
  monitoringStatusLabel: string;
  observedSeconds: number;
  observedMinutes: number;
  observedDurationFormatted: string;
  trackingCoveragePct: number;
  hasAnyObservations: boolean;
  trackedDaysCount: number;
  snapshotBuiltAtMs?: number;
  measurementTimestampMs?: number;
  ageSeconds?: number;
  isStale?: boolean;
  metrics: Record<
    RetisMetricId,
    {
      id?: RetisMetricId;
      label: string;
      value: number | string | null;
      unit?: string;
      formatted: string;
      formattedValue?: string;
      state: MetricDataState;
      unavailableReason: string | null;
      measurementTimestamp?: number;
      ageSeconds?: number;
      isStaleOrUnavailable?: boolean;
      isReliable?: boolean;
      observedTimeBasisSeconds?: number;
    }
  >;
  dataGaps: string[];
}

export interface TelemetryDiagnosticEvent {
  type:
    | 'sensor_update'
    | 'store_update'
    | 'snapshot_built'
    | 'request_sent'
    | 'reply_received';
  timestampMs: number;
  blinkRateBpm: number | null;
  screenDistanceCm: number | null;
  measurementTimestampMs?: number;
  ageSeconds?: number;
  note?: string;
}

function isDevEnvironment(): boolean {
  try {
    const metaEnv = (import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } })?.env;
    if (metaEnv && (metaEnv.DEV || metaEnv.MODE === 'test' || metaEnv.MODE === 'development')) {
      return true;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

class RetisTelemetryDiagnosticsManager {
  private events: TelemetryDiagnosticEvent[] = [];
  private enabled = false;

  public setEnabled(enabled: boolean): void {
    if (!isDevEnvironment()) return;
    this.enabled = enabled;
  }

  public record(event: TelemetryDiagnosticEvent): void {
    if (!isDevEnvironment()) return;
    this.events.push(event);
    if (this.events.length > 200) {
      this.events.shift();
    }
    if (this.enabled) {
      console.debug(`[RETIS-DIAG ${event.timestampMs}] ${event.type}`, {
        blinkRateBpm: event.blinkRateBpm,
        screenDistanceCm: event.screenDistanceCm,
        measurementTimestampMs: event.measurementTimestampMs,
        ageSeconds: event.ageSeconds,
        note: event.note,
      });
    }
  }

  public getEvents(): TelemetryDiagnosticEvent[] {
    if (!isDevEnvironment()) return [];
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
  }
}

export const RetisTelemetryDiagnostics = new RetisTelemetryDiagnosticsManager();

export interface LiveTelemetryStoreEntry {
  telemetry: TelemetryState;
  isMonitoring: boolean;
  cameraStatus: string;
  cameraError?: string;
  measurementTimestampMs: number;
}

class AuthoritativeLiveTelemetryStore {
  private current: LiveTelemetryStoreEntry | null = null;
  private devTestOverride: Partial<LiveTelemetryStoreEntry> | null = null;
  private listeners = new Set<(entry: LiveTelemetryStoreEntry) => void>();

  public update(
    telemetry: TelemetryState,
    isMonitoring = false,
    cameraStatus = 'idle',
    cameraError?: string,
    measurementTimestampMs: number = Date.now()
  ): void {
    this.current = {
      telemetry,
      isMonitoring,
      cameraStatus,
      cameraError,
      measurementTimestampMs,
    };

    RetisTelemetryDiagnostics.record({
      type: 'store_update',
      timestampMs: Date.now(),
      blinkRateBpm: telemetry.avgBlinkRate,
      screenDistanceCm: telemetry.avgScreenDistance,
      measurementTimestampMs,
    });

    const effective = this.getCurrent(telemetry, isMonitoring, cameraStatus, cameraError);
    this.listeners.forEach((listener) => {
      try {
        listener(effective);
      } catch {
        // ignore listener error
      }
    });
  }

  /**
   * Development/test-only value injection for verifying multi-message live telemetry updates
   * without touching real camera measurements or localStorage.
   */
  public setDevTestOverride(override: Partial<LiveTelemetryStoreEntry> | null): void {
    if (!isDevEnvironment()) return;
    this.devTestOverride = override
      ? {
          ...override,
          measurementTimestampMs: override.measurementTimestampMs ?? Date.now(),
        }
      : null;

    if (this.devTestOverride?.telemetry) {
      RetisTelemetryDiagnostics.record({
        type: 'sensor_update',
        timestampMs: Date.now(),
        blinkRateBpm: this.devTestOverride.telemetry.avgBlinkRate,
        screenDistanceCm: this.devTestOverride.telemetry.avgScreenDistance,
        measurementTimestampMs: this.devTestOverride.measurementTimestampMs,
        note: 'dev_test_override',
      });
    }
  }

  public getCurrent(
    fallbackTelemetry?: TelemetryState,
    fallbackIsMonitoring = false,
    fallbackCameraStatus = 'idle',
    fallbackCameraError?: string
  ): LiveTelemetryStoreEntry {
    const base: LiveTelemetryStoreEntry = this.current || {
      telemetry:
        fallbackTelemetry ||
        ({
          avgBlinkRate: null,
          blinkTargetMin: 14,
          blinkTargetMax: 18,
          avgScreenDistance: null,
          distanceOptimal: 45,
          vergenceStatus: 'UNKNOWN',
          dayProgress: 0,
          fatigueScore: null,
          dayCount: 1,
          activeMode: 'default',
          gazePointsAudited: 0,
          blinkAlerts: 0,
          distanceAlerts: 0,
          screenTimeHours: 0,
          longestSessionHours: 0,
          cameraFps: 0,
          nextBreakSeconds: 1200,
          isCalibrated: false,
          isMonitoring: fallbackIsMonitoring,
          faceDetected: false,
          observationSeconds: 0,
          totalBlinksDetected: 0,
        } as TelemetryState),
      isMonitoring: fallbackIsMonitoring,
      cameraStatus: fallbackCameraStatus,
      cameraError: fallbackCameraError,
      measurementTimestampMs: Date.now(),
    };

    if (isDevEnvironment() && this.devTestOverride) {
      return {
        telemetry: this.devTestOverride.telemetry
          ? { ...base.telemetry, ...this.devTestOverride.telemetry }
          : base.telemetry,
        isMonitoring: this.devTestOverride.isMonitoring ?? base.isMonitoring,
        cameraStatus: this.devTestOverride.cameraStatus ?? base.cameraStatus,
        cameraError: this.devTestOverride.cameraError ?? base.cameraError,
        measurementTimestampMs:
          this.devTestOverride.measurementTimestampMs ?? base.measurementTimestampMs,
      };
    }

    return base;
  }

  public subscribe(listener: (entry: LiveTelemetryStoreEntry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getListenerCount(): number {
    return this.listeners.size;
  }
}

export const LiveTelemetryStore = new AuthoritativeLiveTelemetryStore();

export interface SharedDashboardAndRetisSnapshot {
  // Exact shared values used by both DashboardScreen and RetisScreen
  blinkStatus: 'Live' | 'Paused' | 'No face' | 'Camera unavailable';
  distanceStatus: 'Calibrated' | 'Uncalibrated' | 'No face';
  displayBlinkRate: number | null;
  displayDistance: number | null;
  distanceZone: 'No Face' | 'Near' | 'Optimal' | 'Far';
  monitoringGreetingSubtitle: string;
  homeStatusLine: string;
  observedDurationFormatted: string;
  observedDurationWithCoverage: string;
  blinkTargetRangeLabel: string;
  blinkRateStatusLabel: string;
  fatigueBandLabel: string;
  // Weekly aggregates used by DashboardScreen
  pastWeekData: DailyTelemetryRecord[];
  avgFatigue: string;
  maxFatigue: number;
  avgBlinkRateWeekly: number;
  avgDistanceWeekly: number;
  weeklyConsistencyData: Array<{
    day: string;
    date: string;
    adherence: number;
    target: number;
    breaksCompleted: number;
    note: string;
  }>;
  avgAdherence: number;
  adherenceStreak: number;
  // Full RETIS snapshot metadata
  hasAnyObservations: boolean;
  hasSessionObservations: boolean;
  reportingPeriodLabel: string;
  footerStatusLabel: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  trackedDaysCount: number;
  completedBreaksToday: number;
  dataGaps: string[];
  metricEntries: Record<RetisMetricId, SnapshotMetricEntry>;
  trendSeries: DailyTrendPoint[];
  heatmapDays: Array<{ dateStr: string; dayLabel: string; cells: HeatmapCell[] }>;
  heatmapHours: number[];
  llmPayload: RetisAggregateSnapshotPayload;
}

export function formatObservedDuration(observationSeconds: number): string {
  const safeSec = Math.max(0, Math.round(observationSeconds || 0));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${m}m ${s}s`;
}

export function resolveBlinkCardStatus(
  isMonitoring: boolean,
  faceDetected: boolean,
  cameraError?: string
): 'Live' | 'Paused' | 'No face' | 'Camera unavailable' {
  if (cameraError) return 'Camera unavailable';
  if (!isMonitoring) return 'Paused';
  if (!faceDetected) return 'No face';
  return 'Live';
}

export function resolveDistanceCardStatus(
  isCalibrated: boolean,
  faceDetected: boolean
): 'Calibrated' | 'Uncalibrated' | 'No face' {
  if (!isCalibrated) return 'Uncalibrated';
  if (!faceDetected) return 'No face';
  return 'Calibrated';
}

export function resolveDashboardBlinkRate(
  telemetry: TelemetryState,
  isMonitoring: boolean,
  liveSamples?: LiveTelemetryPoint[]
): number | null {
  const rate = telemetry.avgBlinkRate ?? telemetry.rollingBlinkRate ?? null;
  if (rate !== null && Number.isFinite(rate) && rate >= 0) {
    return Math.round(rate);
  }
  if (
    !(isMonitoring && !telemetry.faceDetected) &&
    Array.isArray(liveSamples) &&
    liveSamples.length > 0
  ) {
    const todayStr = toLocalDateStr(new Date());
    for (let i = liveSamples.length - 1; i >= 0; i--) {
      const sample = liveSamples[i];
      if (
        sample &&
        toLocalDateStr(new Date(sample.timestamp)) === todayStr &&
        Number.isFinite(sample.blinkRate) &&
        sample.blinkRate > 0
      ) {
        return Math.round(sample.blinkRate);
      }
    }
  }
  return null;
}

export function resolveDashboardScreenDistance(
  telemetry: TelemetryState,
  isMonitoring: boolean,
  liveSamples?: LiveTelemetryPoint[]
): number | null {
  const dist = telemetry.avgScreenDistance ?? telemetry.screenDistanceCm ?? null;
  if (dist !== null && Number.isFinite(dist) && dist >= 15 && dist <= 120) {
    if (telemetry.faceDetected || !isMonitoring || telemetry.observationSeconds > 0 || dist > 0) {
      return Math.round(dist);
    }
  }
  if (
    telemetry.isCalibrated &&
    !(isMonitoring && !telemetry.faceDetected) &&
    Array.isArray(liveSamples) &&
    liveSamples.length > 0
  ) {
    const todayStr = toLocalDateStr(new Date());
    for (let i = liveSamples.length - 1; i >= 0; i--) {
      const sample = liveSamples[i];
      if (
        sample &&
        toLocalDateStr(new Date(sample.timestamp)) === todayStr &&
        Number.isFinite(sample.distanceCm) &&
        sample.distanceCm >= 15 &&
        sample.distanceCm <= 120
      ) {
        return Math.round(sample.distanceCm);
      }
    }
  }
  return null;
}

export function resolveDistanceZone(
  avgScreenDistance: number | null,
  faceDetected: boolean
): 'No Face' | 'Near' | 'Optimal' | 'Far' {
  if (avgScreenDistance === null || !faceDetected) return 'No Face';
  if (avgScreenDistance < 38) return 'Near';
  if (avgScreenDistance <= 65) return 'Optimal';
  return 'Far';
}

export function resolveMonitoringSubtitle(
  isMonitoring: boolean,
  faceDetected: boolean,
  cameraStatus?: string,
  cameraError?: string
): string {
  if (cameraError) return cameraError;
  if (cameraStatus === 'initializing') return 'Connecting to camera...';
  if (isMonitoring && !faceDetected) return 'Face not detected in camera view.';
  if (isMonitoring) return 'Monitoring active.';
  return 'Monitoring paused.';
}

function isLogFromDate(log: EyeBreakLog, targetDateStr: string): boolean {
  if (!log.id) return false;
  const match = log.id.match(/\d{10,}/);
  if (match) {
    const ts = Number(match[0]);
    if (!isNaN(ts) && ts > 1600000000000) {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}` === targetDateStr;
    }
  }
  return false;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Shared authoritative selector used by BOTH DashboardScreen and RetisScreen.
 * Ensures zero divergence in numbers, formulas, denominators, or status labels.
 */
export function buildSharedTelemetrySnapshot(
  telemetry: TelemetryState,
  isMonitoring = false,
  cameraStatus = 'idle',
  cameraError?: string
): SharedDashboardAndRetisSnapshot {
  const pastWeekData = TelemetryStorageService.getWeeklyRecords(telemetry);
  const liveSamples: LiveTelemetryPoint[] = TelemetryStorageService.getLiveSamples();
  const hourlyRecords: HourlyTelemetryRecord[] = TelemetryStorageService.getHourlyRecords();
  const sessionLogs: EyeBreakLog[] = TelemetryStorageService.getSessionLogs();

  const blinkStatus = resolveBlinkCardStatus(isMonitoring, telemetry.faceDetected, cameraError);
  const distanceStatus = resolveDistanceCardStatus(telemetry.isCalibrated, telemetry.faceDetected);
  const displayBlinkRate = resolveDashboardBlinkRate(telemetry, isMonitoring, liveSamples);
  const displayDistance = resolveDashboardScreenDistance(telemetry, isMonitoring, liveSamples);
  const distanceZone = resolveDistanceZone(displayDistance, telemetry.faceDetected);
  const monitoringGreetingSubtitle = resolveMonitoringSubtitle(
    isMonitoring,
    telemetry.faceDetected,
    cameraStatus,
    cameraError
  );

  const observedDurationFormatted = formatObservedDuration(telemetry.observationSeconds);
  const coveragePct = telemetry.trackingCoveragePct ?? 100;
  const observedDurationWithCoverage = `${observedDurationFormatted} (${coveragePct}% cov.)`;

  // Weekly aggregates matching DashboardScreen
  const avgFatigue =
    pastWeekData.length > 0
      ? (pastWeekData.reduce((acc, curr) => acc + curr.fatigue, 0) / pastWeekData.length).toFixed(1)
      : '0.0';
  const maxFatigue =
    pastWeekData.length > 0 ? Math.max(...pastWeekData.map((d) => d.fatigue)) : 0;
  const avgBlinkRateWeekly =
    pastWeekData.length > 0
      ? Math.round(pastWeekData.reduce((acc, curr) => acc + curr.blinkRate, 0) / pastWeekData.length)
      : 0;
  const avgDistanceWeekly =
    pastWeekData.length > 0
      ? Math.round(pastWeekData.reduce((acc, curr) => acc + curr.distanceCm, 0) / pastWeekData.length)
      : 0;

  const weeklyConsistencyData = pastWeekData.map((d) => ({
    day: d.day,
    date: d.formattedDate,
    adherence: d.compliance,
    target: 80,
    breaksCompleted: Math.max(1, Math.round((d.compliance / 100) * 16)),
    note: d.note,
  }));

  const avgAdherence =
    weeklyConsistencyData.length > 0
      ? Math.round(
          weeklyConsistencyData.reduce((acc, curr) => acc + curr.adherence, 0) /
            weeklyConsistencyData.length
        )
      : 0;
  const adherenceStreak = weeklyConsistencyData.filter((d) => d.adherence >= 80).length;

  // Determine real observation state
  const hasSessionObservations = telemetry.observationSeconds > 0;
  const hasStoredObservations =
    liveSamples.length > 0 || hourlyRecords.length > 0 || pastWeekData.length > 0;
  const hasAnyObservations = hasSessionObservations || hasStoredObservations;

  const today = new Date();
  const todayStr = toLocalDateStr(today);
  const completedBreaksToday = sessionLogs.filter(
    (l) =>
      isLogFromDate(l, todayStr) &&
      l.status === 'Completed' &&
      (l.type.toLowerCase().includes('break') || l.type.toLowerCase().includes('routine'))
  ).length;

  // Date range across retained data (30-day retention policy)
  const allTimestamps: number[] = [];
  if (hasSessionObservations) allTimestamps.push(Date.now());
  liveSamples.forEach((s) => {
    if (s.timestamp) allTimestamps.push(s.timestamp);
  });
  hourlyRecords.forEach((h) => {
    if (h.timestamp) allTimestamps.push(h.timestamp);
  });
  pastWeekData.forEach((d) => {
    if (d.timestamp) allTimestamps.push(d.timestamp);
  });

  const minTs = allTimestamps.length > 0 ? Math.min(...allTimestamps) : Date.now();
  const maxTs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : Date.now();
  const dateRangeStart = new Date(minTs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const dateRangeEnd = new Date(maxTs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Build 7-day calendar window with explicit gap detection for Trends Chart & Heat Map
  const trendSeries: DailyTrendPoint[] = [];
  const heatmapDays: Array<{ dateStr: string; dayLabel: string; cells: HeatmapCell[] }> = [];
  const heatmapHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  const trackedDateSet = new Set<string>();
  if (hasSessionObservations) trackedDateSet.add(todayStr);
  pastWeekData.forEach((r) => {
    if (r.date) trackedDateSet.add(r.date);
  });
  hourlyRecords.forEach((h) => {
    const parts = h.hourKey.split('-');
    if (parts.length >= 3) {
      trackedDateSet.add(`${parts[0]}-${parts[1]}-${parts[2]}`);
    }
  });
  liveSamples.forEach((s) => {
    if (s.timestamp) {
      trackedDateSet.add(toLocalDateStr(new Date(s.timestamp)));
    }
  });

  const trackedDaysCount = trackedDateSet.size;

  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const dStr = toLocalDateStr(d);
    const isToday = offset === 0;
    const shortWeekday = isToday
      ? 'Today'
      : d.toLocaleDateString('en-US', { weekday: 'short' });
    const formattedDate = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    const storedDay = pastWeekData.find(
      (r) => r.date === dStr || (isToday && r.day === 'Today')
    );
    const daySamples = liveSamples.filter(
      (s) => s.timestamp && toLocalDateStr(new Date(s.timestamp)) === dStr
    );
    const dayHourly = hourlyRecords.filter((h) => h.hourKey.startsWith(dStr));
    const dayLogs = sessionLogs.filter((l) => isLogFromDate(l, dStr));

    const dayHasData =
      (isToday && hasSessionObservations) ||
      Boolean(storedDay) ||
      daySamples.length > 0 ||
      dayHourly.length > 0;

    let dayBlinkRate: number | null = null;
    let dayDistanceCm: number | null = null;
    let dayWarnings: number | null = null;
    let dayTotalBlinks: number | null = null;
    let dayFatigue: number | null = null;
    let dayScreenHours: number | null = null;
    let dayCompliance: number | null = null;

    if (dayHasData) {
      if (isToday && hasSessionObservations) {
        dayBlinkRate = telemetry.avgBlinkRate;
        dayDistanceCm = displayDistance ?? telemetry.avgScreenDistance;
        dayWarnings = telemetry.distanceAlerts;
        dayTotalBlinks = telemetry.totalBlinksDetected;
        dayFatigue = telemetry.fatigueScore;
        dayScreenHours = telemetry.screenTimeHours;
        dayCompliance = telemetry.dayProgress;
      } else if (storedDay) {
        dayBlinkRate = storedDay.blinkRate;
        dayDistanceCm = storedDay.distanceCm > 0 ? storedDay.distanceCm : null;
        dayWarnings =
          dayLogs.filter(
            (l) => l.type.includes('Proximity') || l.type.includes('Distance')
          ).length +
          daySamples.filter((s) => s.distanceCm > 0 && s.distanceCm < 40).length;
        const hourlyBlinkSum = dayHourly.reduce((acc, h) => acc + (h.totalBlinks || 0), 0);
        dayTotalBlinks =
          hourlyBlinkSum > 0
            ? hourlyBlinkSum
            : Math.round(storedDay.blinkRate * Math.max(1, storedDay.screenHours * 60));
        dayFatigue = storedDay.fatigue;
        dayScreenHours = storedDay.screenHours;
        dayCompliance = storedDay.compliance;
      } else if (dayHourly.length > 0) {
        dayBlinkRate = Math.round(
          dayHourly.reduce((acc, h) => acc + h.avgBlinkRate, 0) / dayHourly.length
        );
        const validDist = dayHourly.filter((h) => h.avgDistanceCm > 0);
        dayDistanceCm =
          validDist.length > 0
            ? Math.round(
                validDist.reduce((acc, h) => acc + h.avgDistanceCm, 0) / validDist.length
              )
            : null;
        dayWarnings = dayLogs.filter(
          (l) => l.type.includes('Proximity') || l.type.includes('Distance')
        ).length;
        dayTotalBlinks = dayHourly.reduce((acc, h) => acc + (h.totalBlinks || 0), 0);
      }
    }

    trendSeries.push({
      date: dStr,
      day: shortWeekday,
      formattedDate,
      hasData: dayHasData,
      blinkRate: dayBlinkRate,
      distanceCm: dayDistanceCm,
      distanceWarnings: dayWarnings,
      totalValidatedBlinks: dayTotalBlinks,
      fatigue: dayFatigue,
      screenHours: dayScreenHours,
      compliance: dayCompliance,
    });

    // Build hour-of-day cells for this day
    const cells: HeatmapCell[] = heatmapHours.map((hr) => {
      const hrPadded = String(hr).padStart(2, '0');
      const hourKey = `${dStr}-${hrPadded}`;
      const hourLabel =
        hr === 0
          ? '12a'
          : hr === 12
          ? '12p'
          : hr > 12
          ? `${hr - 12}p`
          : `${hr}a`;

      const hrRecord = hourlyRecords.find((h) => h.hourKey === hourKey);
      const hrSamples = daySamples.filter(
        (s) => new Date(s.timestamp).getHours() === hr
      );
      const hrLogs = dayLogs.filter((l) => {
        const match = l.id?.match(/\d{10,}/);
        if (!match) return false;
        return new Date(Number(match[0])).getHours() === hr;
      });
      const isCurrentHourToday =
        isToday && today.getHours() === hr && hasSessionObservations;

      const cellHasData =
        Boolean(hrRecord && hrRecord.monitoredMinutes > 0) ||
        hrSamples.length > 0 ||
        isCurrentHourToday;

      if (!cellHasData) {
        return {
          dateStr: dStr,
          dayLabel: `${shortWeekday} (${formattedDate})`,
          hour: hr,
          hourLabel,
          hasData: false,
          lowBlinkWindows: 0,
          distanceWarnings: 0,
          avgBlinkRate: null,
          avgDistanceCm: null,
          monitoredMinutes: 0,
        };
      }

      // Count low-blink windows (< 10 BPM, matching app's existing lock-in rule)
      let lowBlinkWindows = hrSamples.filter((s) => s.blinkRate < 10).length;
      if (hrSamples.length === 0 && hrRecord && hrRecord.avgBlinkRate < 10) {
        lowBlinkWindows = Math.max(1, hrRecord.monitoredMinutes);
      }
      if (isCurrentHourToday && telemetry.avgBlinkRate !== null && telemetry.avgBlinkRate < 10) {
        lowBlinkWindows = Math.max(lowBlinkWindows, Math.max(1, telemetry.blinkAlerts));
      }

      // Count distance warnings (< 40 cm or logged proximity warnings in this hour)
      let distWarnings = hrLogs.filter(
        (l) => l.type.includes('Proximity') || l.type.includes('Distance')
      ).length;
      if (distWarnings === 0 && hrSamples.length > 0) {
        distWarnings = hrSamples.filter((s) => s.distanceCm > 0 && s.distanceCm < 40).length;
      }
      if (isCurrentHourToday) {
        distWarnings = Math.max(distWarnings, telemetry.distanceAlerts);
      }

      const cellAvgBlink =
        isCurrentHourToday && telemetry.avgBlinkRate !== null
          ? telemetry.avgBlinkRate
          : hrRecord
          ? hrRecord.avgBlinkRate
          : hrSamples.length > 0
          ? Math.round(
              hrSamples.reduce((a, b) => a + b.blinkRate, 0) / hrSamples.length
            )
          : null;

      const cellAvgDist =
        isCurrentHourToday && displayDistance !== null
          ? displayDistance
          : hrRecord && hrRecord.avgDistanceCm > 0
          ? hrRecord.avgDistanceCm
          : hrSamples.length > 0
          ? Math.round(
              hrSamples.reduce((a, b) => a + b.distanceCm, 0) / hrSamples.length
            )
          : null;

      const monitoredMin =
        hrRecord?.monitoredMinutes ??
        Math.max(
          1,
          isCurrentHourToday
            ? Math.ceil(telemetry.observationSeconds / 60)
            : Math.ceil(hrSamples.length / 10)
        );

      return {
        dateStr: dStr,
        dayLabel: `${shortWeekday} (${formattedDate})`,
        hour: hr,
        hourLabel,
        hasData: true,
        lowBlinkWindows,
        distanceWarnings: distWarnings,
        avgBlinkRate: cellAvgBlink,
        avgDistanceCm: cellAvgDist,
        monitoredMinutes: monitoredMin,
      };
    });

    heatmapDays.push({
      dateStr: dStr,
      dayLabel: `${shortWeekday} · ${formattedDate}`,
      cells,
    });
  }

  // Target-range and status labels matching Dashboard
  const blinkTargetRangeLabel = `Target ${telemetry.blinkTargetMin}–${telemetry.blinkTargetMax} BPM`;
  let blinkRateStatusLabel = 'No data yet';
  if (displayBlinkRate === null) {
    blinkRateStatusLabel =
      telemetry.observationSeconds > 0 && telemetry.observationSeconds < 5
        ? 'Not enough data (<5s)'
        : 'No data yet';
  } else if (displayBlinkRate < 10) {
    blinkRateStatusLabel = 'Low (<10 BPM)';
  } else if (displayBlinkRate < telemetry.blinkTargetMin) {
    blinkRateStatusLabel = 'Below target';
  } else if (displayBlinkRate <= telemetry.blinkTargetMax) {
    blinkRateStatusLabel = 'On target';
  } else {
    blinkRateStatusLabel = 'Above target';
  }

  let fatigueBandLabel = 'No data yet';
  if (telemetry.fatigueScore === null) {
    fatigueBandLabel =
      telemetry.observationSeconds > 0 && telemetry.observationSeconds < 5
        ? 'Not enough data (<5s)'
        : 'No data yet';
  } else if (telemetry.fatigueScore <= 2.5) {
    fatigueBandLabel = 'Optimal band (≤2.5)';
  } else if (telemetry.fatigueScore < 4.0) {
    fatigueBandLabel = 'Moderate load';
  } else {
    fatigueBandLabel = 'High load (≥4.0)';
  }

  // Reporting period & real footer label (Defect f fix: no trailing periods, no nested parentheses)
  const cleanMonitoringSubtitle = monitoringGreetingSubtitle.replace(/\.+$/, '').trim();
  const reportingPeriodLabel = hasSessionObservations
    ? `Today (${dateRangeEnd})`
    : hasStoredObservations
    ? `${dateRangeStart} – ${dateRangeEnd}`
    : 'No observations recorded yet';

  const homeStatusLine =
    hasSessionObservations || isMonitoring
      ? `${cleanMonitoringSubtitle} · ${observedDurationFormatted} observed today`
      : hasStoredObservations
      ? `${cleanMonitoringSubtitle} · ${dateRangeStart} – ${dateRangeEnd}`
      : `${cleanMonitoringSubtitle} · 0m 0s observed today`;

  const footerStatusLabel =
    hasSessionObservations || isMonitoring
      ? `Today · ${observedDurationFormatted} observed · ${blinkStatus}`
      : hasStoredObservations
      ? `${dateRangeStart} – ${dateRangeEnd} · ${blinkStatus}`
      : `No data yet · ${blinkStatus}`;

  // Explicit list of data gaps
  const dataGaps: string[] = [];
  if (!hasAnyObservations && displayBlinkRate === null && displayDistance === null) {
    dataGaps.push('No camera observations recorded in the current 30-day retention window.');
  } else if (
    displayBlinkRate === null &&
    telemetry.observationSeconds > 0 &&
    telemetry.observationSeconds < 5
  ) {
    dataGaps.push(
      `Current session has ${Math.round(telemetry.observationSeconds)}s observed time (<5s minimum required for BPM).`
    );
  }
  if (displayDistance === null && !telemetry.isCalibrated) {
    dataGaps.push('Screen distance is uncalibrated; centimetre distance measurements are unavailable.');
  } else if (isMonitoring && !telemetry.faceDetected) {
    dataGaps.push('Camera is running, but no face is currently detected in the frame.');
  } else if (!isMonitoring) {
    dataGaps.push('Live camera monitoring is currently paused.');
  }
  const untrackedDaysInWeek = trendSeries.filter((d) => !d.hasData).length;
  if (untrackedDaysInWeek > 0) {
    dataGaps.push(
      `${untrackedDaysInWeek} of the last 7 days have no recorded tracking sessions (shown as gaps, not zeros).`
    );
  }
  dataGaps.push('Records older than 30 days are automatically pruned per the 30-day retention policy.');

  const validatedBlinksEntry: SnapshotMetricEntry = {
    id: 'validated_blinks',
    label: 'Blinks',
    rawValue: hasSessionObservations || isMonitoring ? telemetry.totalBlinksDetected : null,
    formattedValue:
      hasSessionObservations || isMonitoring
        ? `${telemetry.totalBlinksDetected}`
        : 'Unavailable',
    unit: '',
    state:
      hasSessionObservations || isMonitoring
        ? telemetry.totalBlinksDetected === 0
          ? 'measured_zero'
          : isMonitoring
          ? 'live'
          : 'paused'
        : 'no_data',
    statusBadge:
      hasSessionObservations || isMonitoring
        ? `Observed ${observedDurationFormatted}`
        : 'No data yet',
    unavailableReason:
      hasSessionObservations || isMonitoring
        ? null
        : 'No observations recorded in this session yet',
  };

  const rawDistVal = displayDistance ?? telemetry.avgScreenDistance ?? telemetry.screenDistanceCm ?? null;
  const validDistVal =
    rawDistVal !== null && Number.isFinite(rawDistVal) && rawDistVal >= 15 && rawDistVal <= 120
      ? Math.round(rawDistVal)
      : null;

  const screenDistanceEntry: SnapshotMetricEntry = {
    id: 'avg_distance_cm',
    label: 'Screen distance',
    rawValue: validDistVal,
    formattedValue:
      validDistVal !== null
        ? `${validDistVal} cm`
        : !telemetry.isCalibrated
        ? 'Uncalibrated'
        : 'Unavailable',
    unit: 'cm',
    state:
      validDistVal !== null
        ? isMonitoring && telemetry.faceDetected
          ? 'live'
          : 'paused'
        : !telemetry.isCalibrated
        ? 'uncalibrated'
        : isMonitoring && !telemetry.faceDetected
        ? 'no_face'
        : 'no_data',
    statusBadge: distanceStatus,
    unavailableReason:
      validDistVal !== null
        ? null
        : !telemetry.isCalibrated
        ? 'Uncalibrated — calibrate screen distance to measure cm'
        : isMonitoring && !telemetry.faceDetected
        ? 'No face detected in camera view'
        : 'No data yet — start monitoring to measure distance',
  };

  const blinkAlertsEntry: SnapshotMetricEntry = {
    id: 'blink_alerts',
    label: 'Blink alerts',
    rawValue: hasAnyObservations || isMonitoring ? telemetry.blinkAlerts : null,
    formattedValue:
      hasAnyObservations || isMonitoring ? `${telemetry.blinkAlerts}` : 'Unavailable',
    unit: '',
    state:
      hasAnyObservations || isMonitoring
        ? telemetry.blinkAlerts === 0
          ? 'measured_zero'
          : 'live'
        : 'no_data',
    statusBadge:
      hasAnyObservations || isMonitoring ? '<10 BPM lock-in rule' : 'No data yet',
    unavailableReason:
      hasAnyObservations || isMonitoring ? null : 'No observations recorded yet',
  };

  const distanceWarningsEntry: SnapshotMetricEntry = {
    id: 'distance_warnings',
    label: 'Distance warnings',
    rawValue:
      (hasAnyObservations || isMonitoring) && telemetry.isCalibrated
        ? telemetry.distanceAlerts
        : null,
    formattedValue: !telemetry.isCalibrated
      ? 'Uncalibrated'
      : hasAnyObservations || isMonitoring
      ? `${telemetry.distanceAlerts}`
      : 'Unavailable',
    unit: '',
    state: !telemetry.isCalibrated
      ? 'uncalibrated'
      : hasAnyObservations || isMonitoring
      ? telemetry.distanceAlerts === 0
        ? 'measured_zero'
        : 'live'
      : 'no_data',
    statusBadge: telemetry.isCalibrated ? 'Proximity rule' : 'Uncalibrated',
    unavailableReason: !telemetry.isCalibrated
      ? 'Distance warnings require screen distance calibration'
      : hasAnyObservations || isMonitoring
      ? null
      : 'No observations recorded yet',
  };

  const longestSessionEntry: SnapshotMetricEntry = {
    id: 'longest_session',
    label: 'Longest session',
    rawValue: hasAnyObservations || isMonitoring ? telemetry.longestSessionHours : null,
    formattedValue:
      hasAnyObservations || isMonitoring
        ? `${telemetry.longestSessionHours} hrs`
        : 'Unavailable',
    unit: 'hrs',
    state:
      hasAnyObservations || isMonitoring
        ? telemetry.longestSessionHours === 0
          ? 'measured_zero'
          : 'live'
        : 'no_data',
    statusBadge:
      hasAnyObservations || isMonitoring
        ? `Observed ${observedDurationFormatted}`
        : 'No data yet',
    unavailableReason:
      hasAnyObservations || isMonitoring ? null : 'No session recorded yet',
  };

  const completedBreaksEntry: SnapshotMetricEntry = {
    id: 'completed_breaks',
    label: 'Completed breaks',
    rawValue: completedBreaksToday,
    formattedValue: `${completedBreaksToday}`,
    unit: '',
    state: completedBreaksToday === 0 ? 'measured_zero' : 'live',
    statusBadge: `${telemetry.dayProgress}% of daily goal`,
    unavailableReason: null,
  };

  const trackedDaysEntry: SnapshotMetricEntry = {
    id: 'active_days_count',
    label: 'Tracked days',
    rawValue: trackedDaysCount,
    formattedValue: `${trackedDaysCount}`,
    unit: '',
    state: trackedDaysCount === 0 ? 'no_data' : 'live',
    statusBadge: '30-day retention',
    unavailableReason:
      trackedDaysCount === 0 ? 'No tracked days in the last 30 days' : null,
  };

  // Construct each metric entry with bare value + unit only (no nouns in formattedValue)
  const metricEntries: Record<RetisMetricId, SnapshotMetricEntry> = {
    blink_rate_bpm: {
      id: 'blink_rate_bpm',
      label: 'Avg. blink rate',
      rawValue: displayBlinkRate,
      formattedValue:
        displayBlinkRate !== null ? `${displayBlinkRate} BPM` : 'Unavailable',
      unit: 'BPM',
      state:
        displayBlinkRate !== null
          ? displayBlinkRate === 0
            ? 'measured_zero'
            : isMonitoring && telemetry.faceDetected
            ? 'live'
            : 'paused'
          : telemetry.observationSeconds > 0 && telemetry.observationSeconds < 5
          ? 'insufficient_data'
          : 'no_data',
      statusBadge: blinkRateStatusLabel,
      unavailableReason:
        displayBlinkRate !== null
          ? null
          : telemetry.observationSeconds > 0 && telemetry.observationSeconds < 5
          ? 'Not enough data (<5s valid observation)'
          : 'No data yet — start camera monitoring',
    },
    validated_blinks: validatedBlinksEntry,
    total_validated_blinks: {
      ...validatedBlinksEntry,
      id: 'total_validated_blinks',
    },
    observed_duration: {
      id: 'observed_duration',
      label: 'Observed duration',
      rawValue: Math.round(telemetry.observationSeconds),
      formattedValue: observedDurationFormatted,
      unit: 's',
      state: hasSessionObservations
        ? isMonitoring
          ? 'live'
          : 'paused'
        : 'no_data',
      statusBadge: `${coveragePct}% coverage`,
      unavailableReason: hasSessionObservations ? null : '0s valid observation recorded',
    },
    tracking_coverage: {
      id: 'tracking_coverage',
      label: 'Tracking coverage',
      rawValue: hasSessionObservations ? coveragePct : null,
      formattedValue: hasSessionObservations ? `${coveragePct}%` : 'Unavailable',
      unit: '%',
      state: hasSessionObservations ? (isMonitoring ? 'live' : 'paused') : 'no_data',
      statusBadge: blinkStatus,
      unavailableReason: hasSessionObservations ? null : 'No active tracking session yet',
    },
    avg_distance_cm: screenDistanceEntry,
    screen_distance_cm: {
      ...screenDistanceEntry,
      id: 'screen_distance_cm',
    },
    calibration_status: {
      id: 'calibration_status',
      label: 'Calibration status',
      rawValue: distanceStatus,
      formattedValue: distanceStatus,
      unit: '',
      state: telemetry.isCalibrated ? 'live' : 'uncalibrated',
      statusBadge: distanceStatus,
      unavailableReason: telemetry.isCalibrated ? null : 'Screen distance not calibrated',
    },
    blink_alerts: blinkAlertsEntry,
    blink_alerts_count: {
      ...blinkAlertsEntry,
      id: 'blink_alerts_count',
    },
    distance_warnings: distanceWarningsEntry,
    distance_warnings_count: {
      ...distanceWarningsEntry,
      id: 'distance_warnings_count',
    },
    alerts_delivered: {
      id: 'alerts_delivered',
      label: 'Alerts delivered',
      rawValue:
        hasAnyObservations || isMonitoring
          ? `${telemetry.blinkAlerts} blink, ${
              telemetry.isCalibrated ? `${telemetry.distanceAlerts} distance` : 'uncalibrated'
            }`
          : null,
      formattedValue:
        hasAnyObservations || isMonitoring
          ? `${telemetry.blinkAlerts} / ${
              telemetry.isCalibrated ? `${telemetry.distanceAlerts}` : 'Uncalibrated'
            }`
          : 'Unavailable',
      unit: '',
      state: hasAnyObservations || isMonitoring ? 'live' : 'no_data',
      statusBadge:
        hasAnyObservations || isMonitoring ? 'Separate counts' : 'No data yet',
      unavailableReason:
        hasAnyObservations || isMonitoring ? null : 'No observations recorded yet',
    },
    longest_session: longestSessionEntry,
    longest_session_hours: {
      ...longestSessionEntry,
      id: 'longest_session_hours',
    },
    fatigue_score: {
      id: 'fatigue_score',
      label: 'Fatigue score',
      rawValue: telemetry.fatigueScore,
      formattedValue:
        telemetry.fatigueScore !== null ? `${telemetry.fatigueScore} / 10` : 'Unavailable',
      unit: '/ 10',
      state:
        telemetry.fatigueScore !== null
          ? isMonitoring && telemetry.faceDetected
            ? 'live'
            : 'paused'
          : telemetry.observationSeconds > 0 && telemetry.observationSeconds < 5
          ? 'insufficient_data'
          : 'no_data',
      statusBadge: fatigueBandLabel,
      unavailableReason:
        telemetry.fatigueScore !== null
          ? null
          : telemetry.observationSeconds > 0 && telemetry.observationSeconds < 5
          ? 'Not enough data (<5s valid observation)'
          : 'No data yet — start camera monitoring',
    },
    completed_breaks: completedBreaksEntry,
    completed_breaks_count: {
      ...completedBreaksEntry,
      id: 'completed_breaks_count',
    },
    recommended_exercises: {
      id: 'recommended_exercises',
      label: 'Recommended break routine',
      rawValue: '2-minute break routines',
      formattedValue: '2-minute break routines',
      unit: '',
      state: 'live',
      statusBadge: 'Suggestion',
      unavailableReason: null,
    },
    seven_day_avg_blink_rate: {
      id: 'seven_day_avg_blink_rate',
      label: '7-day avg. blink rate',
      rawValue: pastWeekData.length > 0 ? avgBlinkRateWeekly : null,
      formattedValue: pastWeekData.length > 0 ? `${avgBlinkRateWeekly} BPM` : 'Unavailable',
      unit: 'BPM',
      state: pastWeekData.length > 0 ? 'live' : 'no_data',
      statusBadge: `${trackedDaysCount} tracked days`,
      unavailableReason: pastWeekData.length > 0 ? null : 'No stored 7-day blink records yet',
    },
    seven_day_avg_distance_cm: {
      id: 'seven_day_avg_distance_cm',
      label: '7-day avg. distance',
      rawValue: pastWeekData.length > 0 && avgDistanceWeekly > 0 ? avgDistanceWeekly : null,
      formattedValue:
        pastWeekData.length > 0 && avgDistanceWeekly > 0
          ? `${avgDistanceWeekly} cm`
          : 'Unavailable',
      unit: 'cm',
      state: pastWeekData.length > 0 && avgDistanceWeekly > 0 ? 'live' : 'no_data',
      statusBadge: `${trackedDaysCount} tracked days`,
      unavailableReason:
        pastWeekData.length > 0 && avgDistanceWeekly > 0
          ? null
          : 'No stored 7-day distance records yet',
    },
    active_days_count: trackedDaysEntry,
    tracked_days_count: {
      ...trackedDaysEntry,
      id: 'tracked_days_count',
    },
  };

  const snapshotNowMs = Date.now();
  const storeEntry = LiveTelemetryStore.getCurrent(
    telemetry,
    isMonitoring,
    cameraStatus,
    cameraError
  );
  const measurementTimestampMs = storeEntry.measurementTimestampMs || snapshotNowMs;
  const ageSeconds = Math.max(0, Math.round((snapshotNowMs - measurementTimestampMs) / 1000));
  const isStaleByAge = ageSeconds > TELEMETRY_STALENESS_THRESHOLD_SECONDS;
  const observedBasisSec = Math.round(telemetry.observationSeconds || 0);

  for (const id of ALLOWED_RETIS_METRIC_IDS) {
    const entry = metricEntries[id];
    const isUnavailState =
      entry.rawValue === null ||
      entry.state === 'no_data' ||
      entry.state === 'insufficient_data' ||
      entry.state === 'uncalibrated' ||
      entry.state === 'no_face' ||
      entry.state === 'unavailable';
    entry.measurementTimestamp = measurementTimestampMs;
    entry.ageSeconds = ageSeconds;
    entry.isStaleOrUnavailable = isUnavailState || isStaleByAge;
    entry.isReliable =
      !isUnavailState &&
      (entry.rawValue !== null ||
        id === 'completed_breaks' ||
        id === 'completed_breaks_count' ||
        id === 'recommended_exercises' ||
        id === 'active_days_count' ||
        id === 'tracked_days_count' ||
        observedBasisSec >= 5);
    entry.observedTimeBasisSeconds = observedBasisSec;
  }

  const llmPayload: RetisAggregateSnapshotPayload = {
    reportingPeriod: reportingPeriodLabel,
    dateRangeStart,
    dateRangeEnd,
    retentionWindowDays: 30,
    monitoringStatus:
      blinkStatus === 'Live'
        ? 'live'
        : blinkStatus === 'No face'
        ? 'no_face'
        : blinkStatus === 'Camera unavailable'
        ? 'camera_unavailable'
        : 'paused',
    monitoringStatusLabel: blinkStatus,
    observedSeconds: observedBasisSec,
    observedMinutes: Number((telemetry.observationSeconds / 60).toFixed(2)),
    observedDurationFormatted,
    trackingCoveragePct: coveragePct,
    hasAnyObservations,
    trackedDaysCount,
    snapshotBuiltAtMs: snapshotNowMs,
    measurementTimestampMs,
    ageSeconds,
    isStale: isStaleByAge || !isMonitoring,
    metrics: Object.fromEntries(
      ALLOWED_RETIS_METRIC_IDS.map((id) => [
        id,
        {
          id,
          label: metricEntries[id].label,
          value: metricEntries[id].rawValue,
          unit: metricEntries[id].unit,
          formatted: metricEntries[id].formattedValue,
          formattedValue: metricEntries[id].formattedValue,
          state: metricEntries[id].state,
          unavailableReason: metricEntries[id].unavailableReason,
          measurementTimestamp: metricEntries[id].measurementTimestamp,
          ageSeconds: metricEntries[id].ageSeconds,
          isStaleOrUnavailable: metricEntries[id].isStaleOrUnavailable,
          isReliable: metricEntries[id].isReliable,
          observedTimeBasisSeconds: metricEntries[id].observedTimeBasisSeconds,
        },
      ])
    ) as RetisAggregateSnapshotPayload['metrics'],
    dataGaps,
  };

  return {
    blinkStatus,
    distanceStatus,
    displayBlinkRate,
    displayDistance,
    distanceZone,
    monitoringGreetingSubtitle,
    homeStatusLine,
    observedDurationFormatted,
    observedDurationWithCoverage,
    blinkTargetRangeLabel,
    blinkRateStatusLabel,
    fatigueBandLabel,
    pastWeekData,
    avgFatigue,
    maxFatigue,
    avgBlinkRateWeekly,
    avgDistanceWeekly,
    weeklyConsistencyData,
    avgAdherence,
    adherenceStreak,
    hasAnyObservations,
    hasSessionObservations,
    reportingPeriodLabel,
    footerStatusLabel,
    dateRangeStart,
    dateRangeEnd,
    trackedDaysCount,
    completedBreaksToday,
    dataGaps,
    metricEntries,
    trendSeries,
    heatmapDays,
    heatmapHours,
    llmPayload,
  };
}

/**
 * Builds a fresh snapshot directly from the single authoritative LiveTelemetryStore
 * at the exact millisecond a message (typed, spoken, or dequeued) is sent.
 */
export function buildFreshLiveSnapshotFromStore(
  fallbackTelemetry?: TelemetryState,
  fallbackIsMonitoring = false,
  fallbackCameraStatus = 'idle',
  fallbackCameraError?: string
): SharedDashboardAndRetisSnapshot {
  const current = LiveTelemetryStore.getCurrent(
    fallbackTelemetry,
    fallbackIsMonitoring,
    fallbackCameraStatus,
    fallbackCameraError
  );
  const snap = buildSharedTelemetrySnapshot(
    current.telemetry,
    current.isMonitoring,
    current.cameraStatus,
    current.cameraError
  );
  RetisTelemetryDiagnostics.record({
    type: 'snapshot_built',
    timestampMs: Date.now(),
    blinkRateBpm: snap.metricEntries.blink_rate_bpm.rawValue as number | null,
    screenDistanceCm: snap.metricEntries.screen_distance_cm.rawValue as number | null,
    measurementTimestampMs: snap.llmPayload.measurementTimestampMs,
    ageSeconds: snap.llmPayload.ageSeconds,
  });
  return snap;
}

/**
 * Ensures previous assistant turns in history remain in {{metric_id}} token form
 * so old concrete numbers are never re-sent as current in subsequent turns.
 */
export function sanitizeHistoryTurnToTokens(
  text: string,
  frozenMetrics?: Record<string, { label: string; value: string }>
): string {
  if (!text) return '';
  let result = text;
  if (frozenMetrics) {
    for (const [id, entry] of Object.entries(frozenMetrics)) {
      if (entry?.value && entry.value !== 'Unavailable' && entry.value !== 'Uncalibrated') {
        const escaped = entry.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), `{{${id}}}`);
      }
    }
  }
  return result;
}

/**
 * Substitute {{metric_id}} placeholder tokens with bare number + unit only (never a noun phrase).
 * If frozenMetrics are provided (from a saved historical chat message), uses the exact frozen value.
 */
export function substituteSnapshotTokens(
  answerTemplate: string,
  snapshot: SharedDashboardAndRetisSnapshot,
  frozenMetrics?: Record<string, { label: string; value: string }>
): string {
  const substituted = answerTemplate.replace(
    /\{\{\s*(?:metric:)?([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, rawKey) => {
      const key = rawKey as RetisMetricId;
      if (frozenMetrics && frozenMetrics[key]) {
        return frozenMetrics[key].value;
      }
      const entry = snapshot.metricEntries[key];
      if (!entry) return 'Unavailable';
      if (entry.state === 'uncalibrated') {
        return 'Uncalibrated';
      }
      if (
        entry.rawValue === null ||
        entry.state === 'no_data' ||
        entry.state === 'insufficient_data'
      ) {
        return 'Unavailable';
      }
      return entry.formattedValue;
    }
  );

  // Clean up any accidental duplicate units if the model also wrote the unit after the token
  return substituted
    .replace(/\b(\d+(?:\.\d+)?\s*BPM)\s+BPM\b/gi, '$1')
    .replace(/\b(\d+(?:\.\d+)?\s*cm)\s+cm\b/gi, '$1')
    .replace(/\b(\d+(?:\.\d+)?\s*hrs)\s+(?:hrs|hours?)\b/gi, '$1')
    .replace(/\b(\d+(?:\.\d+)?%)\s*%/g, '$1')
    .replace(/\b(\d+(?:\.\d+)?\s*\/\s*10)\s+(?:out of 10|\/\s*10)\b/gi, '$1');
}

/**
 * Detects clearly off-topic content (coding snippets, SQL, recipes, math proofs, etc.)
 * even if the model returned out_of_scope = false.
 */
function containsClearlyOffTopicContent(text: string): boolean {
  if (/```/.test(text)) return true;
  if (/\b(?:def\s+\w+\s*\(|function\s+\w+\s*\(|console\.log\(|import\s+[\w{]|SELECT\s+\*\s+FROM)\b/i.test(text)) {
    return true;
  }
  const lower = text.toLowerCase();
  if (
    lower.includes('fibonacci sequence is') ||
    lower.includes('here is a python') ||
    lower.includes('here is the python') ||
    lower.includes('preheat the oven') ||
    lower.includes('ingredients:')
  ) {
    return true;
  }
  return false;
}

/**
 * Validate a structured response from the Gemini endpoint against the strict schema,
 * allowed metric IDs, allowed actions, off-topic content check, and untraced number guard.
 */
export function validateRetisStructuredResponse(
  raw: unknown,
  snapshot: SharedDashboardAndRetisSnapshot
): { valid: true; data: RetisStructuredResponse } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Model response is not a JSON object.' };
  }

  const obj = raw as Record<string, unknown>;
  const rawAnswerText =
    typeof obj.answer === 'string' && obj.answer.trim()
      ? obj.answer.trim()
      : typeof obj.answer_template === 'string' && obj.answer_template.trim()
      ? obj.answer_template.trim()
      : '';

  if (!rawAnswerText) {
    return { valid: false, error: 'Missing or invalid answer field.' };
  }
  if (!Array.isArray(obj.metrics_used)) {
    return { valid: false, error: 'Missing or invalid metrics_used array.' };
  }
  if (typeof obj.data_period !== 'string') {
    return { valid: false, error: 'Missing data_period string.' };
  }
  if (typeof obj.data_limitations !== 'string') {
    return { valid: false, error: 'Missing data_limitations string.' };
  }
  if (typeof obj.out_of_scope !== 'boolean') {
    return { valid: false, error: 'Missing out_of_scope boolean.' };
  }
  if (
    typeof obj.suggested_action !== 'string' ||
    !ALLOWED_RETIS_ACTIONS.includes(obj.suggested_action as RetisSuggestedAction)
  ) {
    return {
      valid: false,
      error: `Invalid suggested_action value "${String(obj.suggested_action)}".`,
    };
  }

  // If out_of_scope is true OR the answer contains clearly off-topic content even with out_of_scope = false,
  // normalize to an out-of-scope redirect card with zero numbers and zero metric chips, preserving tailored topic acknowledgment.
  if (obj.out_of_scope || containsClearlyOffTopicContent(rawAnswerText)) {
    const safeOutOfScopeText = containsClearlyOffTopicContent(rawAnswerText)
      ? RETIS_OUT_OF_SCOPE_REDIRECT_TEXT
      : rawAnswerText || RETIS_OUT_OF_SCOPE_REDIRECT_TEXT;
    return {
      valid: true,
      data: {
        answer: safeOutOfScopeText,
        answer_template: safeOutOfScopeText,
        metrics_used: [],
        data_period: snapshot.reportingPeriodLabel,
        data_limitations: '',
        out_of_scope: true,
        suggested_action: 'none',
      },
    };
  }

  // Validate all metric IDs in metrics_used
  const metricsUsed: RetisMetricId[] = [];
  for (const id of obj.metrics_used) {
    if (typeof id !== 'string' || !ALLOWED_RETIS_METRIC_IDS.includes(id as RetisMetricId)) {
      return { valid: false, error: `Unknown metric ID "${String(id)}" in metrics_used.` };
    }
    if (!metricsUsed.includes(id as RetisMetricId)) {
      metricsUsed.push(id as RetisMetricId);
    }
  }

  // Validate all {{placeholder}} tokens in answer
  const tokenMatches = [
    ...rawAnswerText.matchAll(/\{\{\s*(?:metric:)?([a-zA-Z0-9_]+)\s*\}\}/g),
  ];
  for (const match of tokenMatches) {
    const tokenKey = match[1];
    if (!ALLOWED_RETIS_METRIC_IDS.includes(tokenKey as RetisMetricId)) {
      return {
        valid: false,
        error: `Unknown placeholder token "{{${tokenKey}}}" in answer.`,
      };
    }
    if (!metricsUsed.includes(tokenKey as RetisMetricId)) {
      metricsUsed.push(tokenKey as RetisMetricId);
    }
  }

  // Untraced number check: strip {{...}} tokens and explicit app reference phrases (14-18 BPM, 38-65 cm, 30-day, Class 11, etc.)
  // Any remaining standalone numbers must match an actual number in the user's snapshot.
  const stripped = rawAnswerText
    .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '')
    .replace(/\bClass\s+11\b/gi, '')
    .replace(/\b20-20-20\b/gi, '')
    .replace(/\b14[–-]18(?:\s*BPM)?\b/gi, '')
    .replace(/\b38[–-]65(?:\s*cm)?\b/gi, '')
    .replace(/\b50[–-]70(?:\s*cm)?\b/gi, '')
    .replace(/\b30(?:[–-]|\s+)days?\b/gi, '')
    .replace(/\b7(?:[–-]|\s+)days?\b/gi, '')
    .replace(/\b20\s+(?:minutes?|seconds?)\b/gi, '')
    .replace(/\b5\s+(?:seconds?|sessions?|breaks?)\b/gi, '')
    .replace(/\b10(?:\s*BPM)?\b/gi, '')
    .replace(/\b40(?:\s*cm)?\b/gi, '');

  const allowedNumbers = new Set<number>();
  for (const id of ALLOWED_RETIS_METRIC_IDS) {
    const val = snapshot.metricEntries[id].rawValue;
    if (typeof val === 'number' && Number.isFinite(val)) {
      allowedNumbers.add(val);
      allowedNumbers.add(Math.round(val));
    }
  }
  allowedNumbers.add(Math.floor(snapshot.llmPayload.observedSeconds / 60));
  allowedNumbers.add(Math.round(snapshot.llmPayload.observedSeconds % 60));

  const numberTokens = stripped.match(/\b\d+(?:\.\d+)?\b/g) || [];
  for (const numStr of numberTokens) {
    const numVal = Number(numStr);
    if (!allowedNumbers.has(numVal)) {
      return {
        valid: false,
        error: `Rejected untraced number "${numStr}" in model response prose.`,
      };
    }
  }

  return {
    valid: true,
    data: {
      answer: rawAnswerText,
      answer_template: rawAnswerText,
      metrics_used: metricsUsed,
      data_period: obj.data_period || snapshot.reportingPeriodLabel,
      data_limitations: obj.data_limitations,
      out_of_scope: false,
      suggested_action: obj.suggested_action as RetisSuggestedAction,
    },
  };
}
