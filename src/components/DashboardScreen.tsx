import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Bell,
  Eye,
  ArrowUpRight,
  Ruler,
  ArrowRight,
  Play,
  Sliders,
  Activity,
  Sparkles,
  TrendingUp,
  Radio,
  Camera,
  Glasses,
  RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  ActiveTab,
  BehaviorMode,
  TelemetryState,
  LiveTelemetryPoint,
  MonitoringState,
  EyeDetectionState,
  CameraPermissionState,
} from '../types';
import { Button, IconButton } from './ui/Button';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { TelemetryStorageService } from '../services/telemetryStorage';
import { buildSharedTelemetrySnapshot } from '../services/retisSnapshot';
import { OcureDailyPlanService, OCURE_CONFIG } from '../services/ocureService';
import { useTheme } from '../context/ThemeContext';

interface DashboardScreenProps {
  telemetry: TelemetryState;
  onSelectTab: (tab: ActiveTab) => void;
  onChangeMode: (mode: BehaviorMode) => void;
  onOpenBreakModal: () => void;
  onOpenPreferences: () => void;
  userName?: string;
  isMonitoring?: boolean;
  monitoringState?: MonitoringState;
  eyeDetectionState?: EyeDetectionState;
  cameraStatus?: string;
  cameraPermissionState?: CameraPermissionState;
  cameraError?: string;
  onToggleMonitoring?: () => void;
  onOpenCalibration?: () => void;
  onOpenBlinkAudit?: () => void;
  isGlassesMode?: boolean;
  onToggleGlassesMode?: () => void;
  onOpenCameraPanel?: () => void;
  isManualModeOverride?: boolean;
  onResetAutoMode?: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  telemetry,
  onSelectTab,
  onChangeMode,
  onOpenBreakModal,
  onOpenPreferences,
  userName = 'Hinta Suresh',
  isMonitoring = false,
  monitoringState,
  eyeDetectionState,
  cameraStatus = 'idle',
  cameraPermissionState,
  cameraError,
  onToggleMonitoring,
  onOpenCalibration,
  onOpenBlinkAudit,
  isGlassesMode = false,
  onToggleGlassesMode,
  onOpenCameraPanel,
  isManualModeOverride = false,
  onResetAutoMode,
}) => {
  const { isMinimal, isDark, accentColor } = useTheme();

  const [activeMetric, setActiveMetric] = useState<'fatigue' | 'blink' | 'distance' | 'all'>('fatigue');
  const [timeScope, setTimeScope] = useState<'week' | 'live'>('week');
  const [livePoints, setLivePoints] = useState<LiveTelemetryPoint[]>([]);

  // Refresh live collected points regularly
  useEffect(() => {
    const updatePoints = () => {
      setLivePoints(TelemetryStorageService.getLiveSamples());
    };
    updatePoints();
    const interval = setInterval(updatePoints, 2000);
    return () => clearInterval(interval);
  }, []);

  const completedBreaksToday = OcureDailyPlanService.getCompletedBreaksTodayCount();
  const maxDailyBreaks = OCURE_CONFIG.MAX_DAILY_BREAKS;
  const isDailyBreakLimitReached = completedBreaksToday >= maxDailyBreaks;

  // Shared telemetry snapshot (identical code path used by Dashboard and RETIS)
  const sharedSnapshot = buildSharedTelemetrySnapshot(
    telemetry,
    isMonitoring,
    cameraStatus,
    cameraError
  );
  const {
    pastWeekData,
    avgFatigue,
    maxFatigue,
    avgBlinkRateWeekly: avgBlinkRate,
    avgDistanceWeekly: avgDistance,
    weeklyConsistencyData,
    avgAdherence,
    adherenceStreak,
  } = sharedSnapshot;

  // Active chart data based on time scope
  const chartData = timeScope === 'live' && livePoints.length > 0 ? livePoints : pastWeekData;

  // Chart & Surface Tokens across all 4 combinations
  const chartAxisColor = isMinimal
    ? isDark
      ? '#B8AAA0'
      : '#475569'
    : isDark
    ? '#F5F5F0'
    : '#000000';

  const chartGridColor = isMinimal
    ? isDark
      ? 'rgba(255, 245, 235, 0.10)'
      : 'rgba(15, 23, 42, 0.08)'
    : isDark
    ? 'rgba(245, 245, 240, 0.16)'
    : 'rgba(0, 0, 0, 0.15)';

  const chartAxisLineColor = isMinimal
    ? isDark
      ? 'rgba(255, 245, 235, 0.18)'
      : 'rgba(15, 23, 42, 0.14)'
    : isDark
    ? '#F5F5F0'
    : '#000000';

  const primaryAccentHex = isMinimal
    ? accentColor || (isDark ? '#FF7A1A' : '#7B5CD6')
    : isDark
    ? '#D4FF3F'
    : '#FF851B';

  // Weekly Consistency chart sits inside a .tactile-inner paper well (#F7F5EE in Vivid Dark, #FFFFFF in Vivid Light)
  const weeklyChartAxisColor = isMinimal ? chartAxisColor : isDark ? '#0D0D0D' : '#000000';
  const weeklyChartGridColor = isMinimal ? chartGridColor : 'rgba(0, 0, 0, 0.15)';
  const weeklyChartAxisLineColor = isMinimal ? chartAxisLineColor : isDark ? '#0D0D0D' : '#000000';

  const DailyProgressRing = ({ progress }: { progress: number }) => {
    const completedSessions = Math.min(
      maxDailyBreaks,
      Math.max(completedBreaksToday, Math.round((progress / 100) * maxDailyBreaks))
    );
    const effectiveProgress = Math.min(100, Math.round((completedSessions / maxDailyBreaks) * 100));
    const radius = 32;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (effectiveProgress / 100) * circumference;

    return (
      <div
        className={`flex items-center gap-5 ${
          isMinimal ? 'p-6 sm:p-7' : 'p-5 sm:p-6'
        } tactile-card-yellow`}
      >
        <div
          className={
            isMinimal
              ? isDark
                ? 'relative w-20 h-20 shrink-0 flex items-center justify-center rounded-full bg-white/[0.06] border border-white/[0.14] shadow-xs'
                : 'relative w-20 h-20 shrink-0 flex items-center justify-center rounded-full bg-white/85 border border-slate-200/80 shadow-xs'
              : isDark
              ? 'relative w-20 h-20 shrink-0 flex items-center justify-center rounded-full bg-[#F7F5EE] text-[#0D0D0D] border-2 border-[#0D0D0D] shadow-[2px_2px_0px_#0D0D0D]'
              : 'relative w-20 h-20 shrink-0 flex items-center justify-center rounded-full bg-white border-2 border-black shadow-[2px_2px_0px_#000000]'
          }
        >
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 84 84">
            <circle
              cx="42"
              cy="42"
              r={radius}
              className={
                isMinimal
                  ? isDark
                    ? 'stroke-white/15'
                    : 'stroke-slate-900/10'
                  : 'stroke-black/20'
              }
              strokeWidth="7"
              fill="transparent"
            />
            <circle
              cx="42"
              cy="42"
              r={radius}
              className={`${
                isMinimal
                  ? isDark
                    ? 'stroke-[var(--theme-accent,#FF7A1A)]'
                    : 'stroke-[var(--theme-accent,#7B5CD6)]'
                  : isDark
                  ? 'stroke-[#FF8A1F]'
                  : 'stroke-[#FF851B]'
              } transition-all duration-700 ease-out`}
              strokeWidth="7"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-dm text-lg font-extrabold leading-none tabular-nums">
              {completedSessions}/{maxDailyBreaks}
            </span>
            <span className="text-[9px] font-dm uppercase font-bold opacity-75 mt-0.5 tracking-wider">
              Breaks
            </span>
          </div>
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`font-dm text-xs uppercase tracking-wider ${
                isMinimal
                  ? isDark
                    ? 'text-[var(--theme-accent,#FF7A1A)] font-semibold'
                    : 'text-[#5B3CB5] font-semibold'
                  : isDark
                  ? 'text-[#0D0D0D] font-extrabold'
                  : 'text-black font-extrabold'
              }`}
            >
              Today&apos;s breaks: {completedSessions} of {maxDailyBreaks}
            </span>
          </div>
          <h3
            className={`text-xl sm:text-2xl mt-0.5 truncate ${
              isMinimal
                ? isDark
                  ? 'font-eb-garamond font-medium text-[#F5EDE4]'
                  : 'font-eb-garamond font-medium text-[#0F172A]'
                : isDark
                ? 'font-dm text-lg font-extrabold text-[#0D0D0D]'
                : 'font-dm text-lg font-extrabold text-black'
            }`}
          >
            {completedSessions >= maxDailyBreaks
              ? 'Daily limit reached — 5 of 5 breaks completed.'
              : `${maxDailyBreaks - completedSessions} ${maxDailyBreaks - completedSessions === 1 ? 'break' : 'breaks'} remaining today`}
          </h3>
          {completedSessions >= maxDailyBreaks && (
            <p className="font-dm text-xs opacity-85 mt-1">
              You&apos;ve completed all 5 breaks for today. Your next break will be available tomorrow.
            </p>
          )}
        </div>
      </div>
    );
  };

  const WeeklyConsistencyTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: any }>;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-2xl p-3.5 glass-modal text-xs font-dm min-w-[190px]">
          <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-1.5 mb-2">
            <span className="font-dm font-extrabold uppercase text-[11px]">
              {data.day} · {data.date}
            </span>
            <span className="glass-badge text-[10px]">
              {data.adherence >= 80 ? '✓ Goal Met' : 'Under Target'}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold opacity-80">Breaks completed:</span>
              <span className="text-sm font-extrabold tabular-nums">{data.adherence}%</span>
            </div>
            <div className="flex items-center justify-between opacity-80 text-[11px] font-medium">
              <span>Completed Breaks:</span>
              <span className="font-bold tabular-nums">~{data.breaksCompleted} sessions</span>
            </div>
            <div className="flex items-center justify-between opacity-75 text-[10px] pt-1 border-t border-current/20">
              <span>Goal:</span>
              <span className="font-bold">80% target</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; payload: any }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isLivePoint = 'timeStr' in data;

      return (
        <div className="rounded-2xl p-3.5 glass-modal text-xs font-dm min-w-[210px]">
          <div className="flex items-center justify-between gap-2 border-b-2 border-black pb-1.5 mb-2">
            <span className="font-dm font-extrabold uppercase text-[11px]">
              {isLivePoint ? `Live · ${data.timeStr}` : `${label} · ${data.formattedDate}`}
            </span>
            <span className="text-[10px] font-bold opacity-85">
              {isLivePoint ? 'Live reading' : data.note}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold opacity-80">Eye Fatigue:</span>
              <span className="text-sm font-extrabold tabular-nums">
                {isLivePoint ? data.fatigueScore : data.fatigue}{' '}
                <span className="text-[10px] opacity-75 font-normal">/ 10</span>
              </span>
            </div>
            <div className="flex items-center justify-between opacity-85 text-[11px]">
              <span className="font-semibold">Blink rate:</span>
              <span className="font-extrabold tabular-nums">{data.blinkRate} /min</span>
            </div>
            <div className="flex items-center justify-between opacity-85 text-[11px]">
              <span className="font-semibold">Screen Distance:</span>
              <span className="font-extrabold tabular-nums">{data.distanceCm} cm</span>
            </div>
            {!isLivePoint && (
              <div className="flex items-center justify-between opacity-75 text-[10px] pt-1 border-t border-current/20">
                <span className="font-semibold">Screen Hours: {data.screenHours}h</span>
                <span className="font-extrabold">{data.compliance}% Completed</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const effectiveMonitoringState: MonitoringState =
    monitoringState ||
    telemetry.monitoringState ||
    (isMonitoring ? (telemetry.faceDetected ? 'ACTIVE' : 'NO_FACE') : 'PAUSED');

  const effectiveEyeDetectionState: EyeDetectionState =
    eyeDetectionState ||
    telemetry.eyeDetectionState ||
    (isMonitoring
      ? telemetry.faceDetected
        ? 'Eyes detected'
        : 'Eyes not detected'
      : 'Detection unavailable');

  return (
    <div
      className={`relative w-full flex flex-col ${
        isMinimal ? 'gap-8 pb-8' : 'gap-6 pb-4'
      } min-w-0 box-border`}
    >

      {/* Top bar with greeting and controls */}
      <div
        key="dashboard-greeting-header"
        className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-4 min-w-0 box-border px-1">
          <div className="flex flex-col min-w-0">
            <h1
              className={`font-cormorant text-4xl sm:text-5xl tracking-tight leading-[1.1] ${
                isMinimal
                  ? isDark
                    ? 'font-medium text-[#F5EDE4]'
                    : 'font-medium text-[#0F172A]'
                  : isDark
                  ? 'font-bold text-[#F5F5F0]'
                  : 'font-bold text-black'
              }`}
            >
              Good Morning,{' '}
              <span
                className={`italic ${
                  isMinimal
                    ? isDark
                      ? 'font-normal text-[var(--theme-accent,#FF7A1A)]'
                      : 'font-normal text-[#5B3CB5]'
                    : isDark
                    ? 'font-semibold text-[var(--vivid-accent,#D4FF3F)]'
                    : 'font-semibold text-black'
                }`}
              >
                {userName}
              </span>
            </h1>
            <p className="font-dm text-[15px] opacity-85 mt-2 max-w-2xl leading-relaxed flex items-center gap-2 flex-wrap">
              {effectiveMonitoringState === 'STARTING' ? (
                <span className="font-semibold flex items-center gap-1.5 animate-pulse">
                  Requesting permission... Initializing camera.
                </span>
              ) : effectiveMonitoringState === 'CAMERA_BLOCKED' ? (
                <span className="font-bold underline text-amber-500">
                  Camera blocked. Enable camera access in your browser or settings.
                </span>
              ) : effectiveMonitoringState === 'CAMERA_BUSY' ? (
                <span className="font-semibold text-amber-500">
                  Camera in use by another application.
                </span>
              ) : effectiveMonitoringState === 'ERROR' ? (
                <span className="font-bold underline">
                  {cameraError || 'Camera unavailable'}
                </span>
              ) : effectiveMonitoringState === 'NO_FACE' ? (
                <span className="font-semibold flex items-center gap-1.5">
                  Face not detected in camera view.
                </span>
              ) : effectiveMonitoringState === 'ACTIVE' ? (
                <span className="font-semibold flex items-center gap-2">
                  <span>Monitoring active.</span>
                  <span className="glass-badge text-[11px] font-bold">
                    {effectiveEyeDetectionState}
                  </span>
                </span>
              ) : (
                <span>Monitoring paused.</span>
              )}
            </p>
          </div>

          {/* Top Status & Controls */}
          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
            {/* Status Indicator Pill / Start Monitoring Control */}
            <button
              type="button"
              onClick={onToggleMonitoring}
              className={effectiveMonitoringState === 'ACTIVE' || effectiveMonitoringState === 'NO_FACE' ? 'btn-pill-primary' : 'btn-pill-secondary'}
              title={isMonitoring ? 'Click to pause monitoring' : 'Click to resume webcam monitoring'}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isMinimal
                    ? effectiveMonitoringState === 'ACTIVE'
                      ? isDark
                        ? 'bg-[#0D0D0D] animate-pulse'
                        : 'bg-white animate-pulse'
                      : effectiveMonitoringState === 'NO_FACE'
                      ? 'bg-amber-300'
                      : 'bg-[#FF7A1A]'
                    : `border border-black ${
                        effectiveMonitoringState === 'ACTIVE'
                          ? 'bg-[#25D6C1] animate-pulse'
                          : effectiveMonitoringState === 'NO_FACE'
                          ? 'bg-[#FF851B]'
                          : 'bg-[#FF851B]'
                      }`
                }`}
              />
              <span className="font-dm text-xs uppercase tracking-wider">
                {effectiveMonitoringState === 'ACTIVE'
                  ? 'IRIS MONITORING (ACTIVE)'
                  : effectiveMonitoringState === 'NO_FACE'
                  ? 'MONITORING (NO FACE)'
                  : effectiveMonitoringState === 'STARTING'
                  ? 'STARTING...'
                  : effectiveMonitoringState === 'CAMERA_BLOCKED'
                  ? 'CAMERA BLOCKED'
                  : effectiveMonitoringState === 'CAMERA_BUSY'
                  ? 'CAMERA BUSY'
                  : effectiveMonitoringState === 'ERROR'
                  ? 'CAMERA ERROR'
                  : 'RESUME MONITORING'}
              </span>
            </button>

            {onOpenCameraPanel && (
              <button
                type="button"
                onClick={onOpenCameraPanel}
                className={`relative px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 border ${
                  telemetry.cameraDiagnostics?.cameraMode === 'STANDBY_EXCLUSIVE_LOCK' || telemetry.cameraDiagnostics?.cameraMode === 'STANDBY_LOCKED'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    : telemetry.cameraDiagnostics?.concurrentAppName
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30'
                    : 'bg-white/10 text-white/90 border-white/15 hover:bg-white/15'
                }`}
                title={`Camera Compatibility & Glasses Detection Status${telemetry.cameraDiagnostics?.concurrentAppName ? ` (Shared with ${telemetry.cameraDiagnostics.concurrentAppName})` : ''}`}
                aria-label="Camera Compatibility & Glasses Detection Status"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {telemetry.cameraDiagnostics?.concurrentAppName
                    ? `Shared (${telemetry.cameraDiagnostics.concurrentAppName})`
                    : 'Camera'}
                </span>
                {isGlassesMode && (
                  <span title="Glasses-Optimized Mode active">
                    <Glasses className="w-3.5 h-3.5 text-cyan-300 ml-0.5" />
                  </span>
                )}
                <span
                  className={`w-2 h-2 rounded-full ${
                    telemetry.cameraDiagnostics?.cameraMode === 'STANDBY_EXCLUSIVE_LOCK' || telemetry.cameraDiagnostics?.cameraMode === 'STANDBY_LOCKED'
                      ? 'bg-amber-400 animate-pulse'
                      : isMonitoring
                      ? 'bg-emerald-400'
                      : 'bg-zinc-400'
                  }`}
                />
              </button>
            )}

            {onOpenCalibration && (
              <IconButton
                icon={<Ruler className="w-4 h-4" />}
                aria-label="Calibrate screen distance"
                title="Calibrate screen distance"
                onClick={onOpenCalibration}
                size="md"
                shape="circle"
              />
            )}

            <div className="relative">
              <IconButton
                icon={<Bell className="w-4 h-4" />}
                aria-label="Trigger eye break"
                onClick={onOpenBreakModal}
                size="md"
                shape="circle"
                badgeDot={true}
              />
            </div>
          </div>
        </div>

      {/* ============================================================== */}
      {/* MAIN TOP GRID: 2 METRIC CARDS + MATCHING COMPANION COLUMN */}
      {/* ============================================================== */}
      <div
        key="dashboard-metric-row"
        className={`relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${
          isMinimal ? 'gap-7' : 'gap-6'
        } items-stretch min-w-0 box-border`}
      >
        {/* Card 1: Avg Blink Rate */}
        <div
          onClick={() => onSelectTab('retis')}
          className={`iris-stagger-1 aspect-square tactile-card-purple tactile-card-interactive ${
            isMinimal ? 'p-7 sm:p-8' : 'p-6 sm:p-7'
          } group flex flex-col justify-between min-w-0 box-border overflow-hidden relative`}
        >
          {/* Top Row: Title + Icon + Controls */}
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 tactile-icon-tile">
                <Eye className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-dm text-xs uppercase font-bold tracking-wider truncate">
                  AVG. BLINK RATE
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isMonitoring &&
                (telemetry.blinkState === 'CLOSING' ||
                  telemetry.blinkState === 'CLOSED' ||
                  telemetry.blinkState === 'REOPENING') && (
                  <span className="glass-badge text-[10px] uppercase tracking-wider">
                    BLINK
                  </span>
                )}

              {onToggleGlassesMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleGlassesMode();
                  }}
                  className={`btn-pill-secondary px-2.5 py-1 text-[11px] flex items-center gap-1 border ${
                    isGlassesMode
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                      : 'border-white/10 text-white/60 hover:text-white/90'
                  }`}
                  title={isGlassesMode ? 'Glasses-Optimized Mode active (Click to toggle)' : 'Enable Glasses Mode'}
                >
                  <Glasses className="w-3 h-3" />
                  <span className="hidden sm:inline">Glasses</span>
                </button>
              )}

              {onOpenBlinkAudit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenBlinkAudit();
                  }}
                  className="btn-pill-secondary px-3 py-1 text-[11px]"
                  title="Blink audit"
                >
                  <Activity className="w-3 h-3" />
                  <span>Audit</span>
                </button>
              )}

              <div className="w-8 h-8 rounded-full tactile-icon-tile">
                <ArrowUpRight className="w-4 h-4 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-150" />
              </div>
            </div>
          </div>

          {/* Center: Primary BPM + Validated Blinks + Real Events Cadence + Observed Duration */}
          <div className="my-auto py-2 flex flex-col gap-3 z-10">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <AnimatedNumber
                  value={sharedSnapshot.displayBlinkRate}
                  fallback="--"
                  className="font-dm text-5xl sm:text-6xl font-bold leading-none tracking-[-0.03em] tabular-nums"
                />
                <span className="font-dm text-lg font-semibold opacity-90">BPM</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="glass-badge tabular-nums">
                  <AnimatedNumber value={telemetry.totalBlinksDetected} /> Blinks
                </span>
              </div>
            </div>

            {/* Ocular Rhythm Wave Cadence: only active when real validated events exist */}
            <div className="w-full tactile-inner p-3">
              <div className="flex items-center justify-between text-[11px] font-dm uppercase font-bold mb-1.5 tracking-wider">
                <span>Rhythm</span>
              </div>
              <div className="flex items-end gap-1.5 h-7">
                {[6, 9, 14, 18, 12, 16, 20, 15, 11, 17].map((height, idx) => {
                  const isActive =
                    sharedSnapshot.displayBlinkRate !== null &&
                    idx < Math.min(10, Math.max(1, Math.round((sharedSnapshot.displayBlinkRate / 20) * 10)));
                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-full transition-all duration-300 ${
                        isMinimal
                          ? isActive
                            ? isDark
                              ? 'bg-[var(--theme-accent,#FF7A1A)]'
                              : 'bg-white'
                            : isDark
                            ? 'bg-white/15'
                            : 'bg-white/25'
                          : isDark
                          ? `border border-[#0D0D0D] ${isActive ? 'bg-[#FF8A1F]' : 'bg-black/15'}`
                          : `border border-black ${isActive ? 'bg-[#FF851B]' : 'bg-black/15'}`
                      }`}
                      style={{ height: `${(height / 20) * 100}%` }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Observed Duration */}
            <div className="tactile-inner p-2.5 flex items-center justify-between text-xs">
              <span className="text-[10px] uppercase font-dm font-bold opacity-75 tracking-wider">
                Observed time
              </span>
              <span className="font-dm text-xs font-bold tabular-nums">
                {Math.floor(telemetry.observationSeconds / 60)}m {Math.round(telemetry.observationSeconds % 60)}s
                {telemetry.trackingCoveragePct !== undefined ? ` (${telemetry.trackingCoveragePct}% tracked)` : ''}
              </span>
            </div>
          </div>

          {/* Bottom Row: One Accurate Status Indicator (Eyes detected, Eyes not detected, Detection unavailable) */}
          {(() => {
            const blinkStatus =
              effectiveMonitoringState === 'ACTIVE'
                ? effectiveEyeDetectionState
                : effectiveMonitoringState === 'NO_FACE'
                ? 'Eyes not detected'
                : effectiveMonitoringState === 'STARTING'
                ? 'Starting'
                : effectiveMonitoringState === 'CAMERA_BLOCKED'
                ? 'Camera blocked'
                : effectiveMonitoringState === 'CAMERA_BUSY'
                ? 'Camera busy'
                : effectiveMonitoringState === 'ERROR'
                ? 'Camera unavailable'
                : 'Paused';
            return (
              <div className="flex items-center justify-between gap-2 pt-3 border-t-2 border-black z-10 min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      blinkStatus === 'Eyes detected'
                        ? isMinimal
                          ? isDark
                            ? 'bg-[var(--theme-accent,#FF7A1A)]'
                            : 'bg-[#A7F3D0]'
                          : isDark
                          ? 'bg-[#25D6C1] border border-[#0D0D0D]'
                          : 'bg-[#25D6C1]'
                        : blinkStatus === 'Eyes not detected'
                        ? isMinimal
                          ? 'bg-amber-300'
                          : isDark
                          ? 'bg-[#FF8A1F] border border-[#0D0D0D]'
                          : 'bg-[#FF851B]'
                        : 'bg-zinc-400'
                    }`}
                  />
                  <span className="font-dm text-xs font-semibold truncate">
                    {blinkStatus}
                  </span>
                </div>
                <span className="glass-badge text-[11px] shrink-0 uppercase">
                  {blinkStatus}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Card 2: Avg Screen Distance */}
        <div
          onClick={() => onSelectTab('retis')}
          className={`iris-stagger-2 aspect-square tactile-card-teal tactile-card-interactive ${
            isMinimal ? 'p-7 sm:p-8' : 'p-6 sm:p-7'
          } group flex flex-col justify-between min-w-0 box-border overflow-hidden relative`}
        >
          {/* Top Row: Title + Icon + Controls */}
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 tactile-icon-tile">
                <Ruler className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-dm text-xs uppercase font-bold tracking-wider truncate">
                  AVG. SCREEN DISTANCE
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCalibration?.();
                }}
                className="btn-pill-secondary px-3 py-1 text-[11px]"
                title="Open screen distance calibration wizard"
              >
                <Ruler className="w-3 h-3" />
                <span>{telemetry.isCalibrated ? 'Recalibrate' : 'Calibrate'}</span>
              </button>
              <div className="w-8 h-8 rounded-full tactile-icon-tile">
                <ArrowUpRight className="w-4 h-4 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-150" />
              </div>
            </div>
          </div>

          {/* Center: Big Stat + Horizon Gauge (if calibrated) + Real Distance Alerts */}
          {(() => {
            const distanceStatus = !telemetry.isCalibrated
              ? 'Distance unavailable'
              : !isMonitoring
              ? 'Paused'
              : !telemetry.faceDetected
              ? 'No face'
              : 'Calibrated';
            const displayDistance =
              telemetry.isCalibrated && telemetry.faceDetected && isMonitoring && telemetry.avgScreenDistance !== null
                ? telemetry.avgScreenDistance
                : null;
            const isNearWarning = displayDistance !== null && displayDistance < 38;
            const distColorStyle =
              displayDistance === null
                ? undefined
                : displayDistance < 38
                ? '#EF4444'
                : displayDistance < 42
                ? '#F59E0B'
                : '#10B981';

            return (
              <>
                <div className="my-auto py-2 flex flex-col gap-3 z-10">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1.5" style={{ color: distColorStyle }}>
                      <AnimatedNumber
                        value={displayDistance}
                        fallback="--"
                        className="font-dm text-5xl sm:text-6xl font-bold leading-none tracking-[-0.03em] tabular-nums"
                      />
                      <span
                        className="font-dm text-lg font-semibold opacity-90"
                      >
                        cm
                      </span>
                    </div>
                    <span
                      style={{ color: isNearWarning ? '#EF4444' : undefined, borderColor: isNearWarning ? 'rgba(239, 68, 68, 0.4)' : undefined }}
                      className="glass-badge font-dm font-bold uppercase tracking-wider text-[11px]"
                    >
                      {distanceStatus}
                    </span>
                  </div>

                  {/* Calibrated 3-Zone Distance Depth Horizon Gauge - only shown when calibrated */}
                  {telemetry.isCalibrated ? (
                    <div className="w-full tactile-inner p-3">
                      <div className="flex items-center justify-between text-[11px] font-dm uppercase font-bold mb-1.5 tracking-wider">
                        <span>Distance range</span>
                        <span className="glass-badge h-5 px-2 text-[10px]">
                          {displayDistance === null || (isMonitoring && !telemetry.faceDetected)
                            ? 'No Face'
                            : displayDistance < 38
                            ? 'Near'
                            : displayDistance <= 65
                            ? 'Optimal'
                            : 'Far'}
                        </span>
                      </div>

                      {/* Multi-Zone Depth Track */}
                      <div
                        className={
                          isMinimal
                            ? isDark
                              ? 'relative w-full h-2.5 rounded-full bg-white/10 overflow-hidden flex'
                              : 'relative w-full h-2.5 rounded-full bg-slate-900/12 overflow-hidden flex'
                            : isDark
                            ? 'relative w-full h-3 rounded-full bg-black/15 border-2 border-[#0D0D0D] overflow-hidden flex'
                            : 'relative w-full h-3 rounded-full bg-black/15 border-2 border-black overflow-hidden flex'
                        }
                      >
                        <div
                          className={
                            isMinimal
                              ? 'w-[35%] h-full bg-[#FF7A1A]/85'
                              : isDark
                              ? 'w-[35%] h-full bg-[#FF8A1F] border-r border-[#0D0D0D]'
                              : 'w-[35%] h-full bg-[#FF851B] border-r border-black'
                          }
                          title="Near (<38cm)"
                        />
                        <div
                          className={
                            isMinimal
                              ? isDark
                                ? 'w-[45%] h-full bg-[var(--theme-accent,#FF7A1A)]'
                                : 'w-[45%] h-full bg-[#5B3CB5]'
                              : isDark
                              ? 'w-[45%] h-full bg-[#25D6C1] border-r border-[#0D0D0D]'
                              : 'w-[45%] h-full bg-[#25D6C1] border-r border-black'
                          }
                          title="Good (38–65cm)"
                        />
                        <div
                          className={
                            isMinimal
                              ? 'w-[20%] h-full bg-[#3B82F6]/80'
                              : isDark
                              ? 'w-[20%] h-full bg-[#D4FF3F]'
                              : 'w-[20%] h-full bg-[#FFD84D]'
                          }
                          title="Far (>65cm)"
                        />
                      </div>

                      {/* Pin Indicator */}
                      <div className="relative w-full h-2 mt-1">
                        <div
                          className="absolute top-0 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[7px] border-b-current transition-all duration-300"
                          style={{
                            left: `${
                              displayDistance !== null && !(isMonitoring && !telemetry.faceDetected)
                                ? Math.min(95, Math.max(5, (displayDistance / 80) * 100))
                                : 50
                            }%`,
                          }}
                        />
                      </div>

                      <div className="flex justify-between text-[10px] font-dm uppercase font-semibold opacity-75 mt-1">
                        <span>Near (&lt;38cm)</span>
                        <span>Optimal (38-65cm)</span>
                        <span>Far (&gt;65cm)</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCalibration?.();
                      }}
                      className="btn-pill-primary w-full py-2.5 my-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Calibrate Screen Distance</span>
                    </button>
                  )}

                  {/* Distance Alerts: Real count for current day only */}
                  <div className="tactile-inner p-2.5 flex items-center justify-between text-xs">
                    <span className="text-[10px] uppercase font-dm font-bold opacity-75 tracking-wider">
                      Distance Alerts
                    </span>
                    <span className="font-dm text-xs font-bold tabular-nums">
                      <AnimatedNumber value={telemetry.distanceAlerts} /> Warnings Today
                    </span>
                  </div>
                </div>

                {/* Bottom Row: One Accurate Status Indicator */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t-2 border-black z-10 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        distanceStatus === 'Calibrated'
                          ? isMinimal
                            ? isDark
                              ? 'bg-[var(--theme-accent,#FF7A1A)]'
                              : 'bg-[#5B3CB5]'
                            : isDark
                            ? 'bg-[#D4FF3F] border border-[#0D0D0D]'
                            : 'bg-[#25D6C1]'
                          : distanceStatus === 'No face'
                          ? isMinimal
                            ? 'bg-amber-400'
                            : isDark
                            ? 'bg-[#FF8A1F] border border-[#0D0D0D]'
                            : 'bg-[#FF851B]'
                          : 'bg-zinc-400'
                      }`}
                    />
                    <span className="font-dm text-xs font-semibold truncate">
                      {distanceStatus}
                    </span>
                  </div>
                  <span className="glass-badge text-[11px] shrink-0 uppercase">
                    {telemetry.isCalibrated ? 'Calibrated' : 'Uncalibrated'}
                  </span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Column 3: Companion Tiles (RETIS & OCURE) */}
        <div
          className={`iris-stagger-3 aspect-square flex flex-col ${
            isMinimal ? 'gap-7' : 'gap-6'
          } justify-between min-w-0 box-border`}
        >
          {/* Tile 1: Retis Analyst Shortcut */}
          <div
            onClick={() => onSelectTab('retis')}
            className="flex-1 tactile-card-orange tactile-card-interactive p-5 sm:p-6 flex items-center justify-between gap-4 group min-w-0 box-border overflow-hidden"
          >
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span
                className={`font-dm text-[11px] uppercase tracking-wider truncate ${
                  isMinimal
                    ? isDark
                      ? 'text-[var(--theme-accent,#FF7A1A)] font-semibold'
                      : 'text-[#5B3CB5] font-semibold'
                    : isDark
                    ? 'text-[#0D0D0D]/85 font-extrabold'
                    : 'text-black/85 font-extrabold'
                }`}
              >
                REPORTS
              </span>
              <h3 className="font-cormorant text-2xl font-bold tracking-tight leading-tight">
                RETIS
              </h3>
              <p className="font-dm text-xs opacity-85 line-clamp-2 mt-0.5">
                Ask questions about your screen habits and break routines.
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  pill={true}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTab('retis');
                  }}
                >
                  Ask Retis
                </Button>
              </div>
            </div>

            <div className="w-20 h-20 rounded-2xl tactile-inner p-1.5 shrink-0 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-200">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBJRlMjzwizOP-qy5nngSN2eqfTHcZ1VRmxjlsATG5lmcZToKibthd_VKIJ_7PtjndsoJLHYe-7Zd-IjKAAMljexuPBjS522-nbNCngsAxKGCUEYr_LrRE71_UXjx4-oATcVsnWxiYqKpHH-oFd38dI-TFKnX9RfIGVGIZQQZtCbwN_20js9VpekJRtRLxhO_dnGUdYVepf-EPbhEeGBEmTbg6HwuGrYdiYRuHzHX9Oy-tulm-LBEhllBHbOOp-xPkj3BI"
                alt="Retis Thumbnail"
                className="w-full h-full object-contain select-none animate-character-float"
              />
            </div>
          </div>

          {/* Tile 2: Ocure Coach Shortcut */}
          <div
            onClick={() => onSelectTab('ocure')}
            className="flex-1 tactile-card-yellow tactile-card-interactive p-5 sm:p-6 flex items-center justify-between gap-4 group min-w-0 box-border overflow-hidden"
          >
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span
                className={`font-dm text-[11px] uppercase tracking-wider truncate ${
                  isMinimal
                    ? isDark
                      ? 'text-[var(--theme-accent,#FF7A1A)] font-semibold'
                      : 'text-[#5B3CB5] font-semibold'
                    : isDark
                    ? 'text-[#0D0D0D]/85 font-extrabold'
                    : 'text-black/85 font-extrabold'
                }`}
              >
                2-MINUTE BREAKS
              </span>
              <h3 className="font-cormorant text-2xl font-bold tracking-tight leading-tight">
                OCURE
              </h3>
              <p className="font-dm text-xs opacity-85 line-clamp-2 mt-0.5">
                {isDailyBreakLimitReached
                  ? 'Daily limit reached — 5 of 5 breaks completed.'
                  : `Today's breaks: ${completedBreaksToday} of ${maxDailyBreaks}`}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  pill={true}
                  disabled={isDailyBreakLimitReached}
                  leftIcon={<Play className="w-3 h-3 fill-current" />}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDailyBreakLimitReached) {
                      onOpenBreakModal();
                    }
                  }}
                >
                  {isDailyBreakLimitReached ? 'Daily Limit Reached' : 'Start Break'}
                </Button>
              </div>
            </div>

            <div className="w-20 h-20 rounded-2xl tactile-inner p-1.5 shrink-0 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-200">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCbN92TvM06KjPEUQEQgI2JuepRZi78gGo3RaNtvyJLLcscayGgfRUb3TJQXyti-nL7_zzNZHrexPwKAVXv2r5JGD1FOTQzKaMlw76va6kO58J341ZZjVd2IYVQl972F0GTW8FSoCpzoi-LSpoz_UwG6F-K4CXAj685y6FSrE__0ICRv5DY1IPK42onFK4if_gvrJjNs_GiDjCTGnrSPBp_Nb51l5bkez03ecQL_NrZRsQ5xrcpnWEiZ1CA6nBEgx5cGkY"
                alt="Ocure Thumbnail"
                className="w-full h-full object-contain select-none animate-character-breathe"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modes Adaptive Telemetry Profile Bar */}
      <div
        key="dashboard-modes"
        className={`iris-stagger-4 relative z-10 tactile-card-orange ${
          isMinimal ? 'p-6 sm:p-7' : 'p-5 sm:p-6'
        } flex flex-col xl:flex-row xl:items-center justify-between gap-4 min-w-0 box-border`}
      >
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div className="w-11 h-11 tactile-icon-tile">
            <Sliders className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0 justify-center">
            <div className="flex items-center gap-2">
              <h3 className="font-cormorant text-xl font-bold">Modes</h3>
              {isManualModeOverride && (
                <span className="glass-badge text-[10px] font-bold text-amber-400 border border-amber-400/30">
                  Manual Override Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3 Modes Pills + Reset to Auto Button */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 min-w-0">
          {isManualModeOverride && onResetAutoMode && (
            <button
              type="button"
              onClick={onResetAutoMode}
              className="px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
              title="Click to reset to automatic app & camera detection"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Auto</span>
            </button>
          )}

          {[
            { id: 'gaming' as BehaviorMode, label: 'Gaming', sub: 'Lenient Breaks' },
            { id: 'default' as BehaviorMode, label: 'Default', sub: 'Standard Breaks' },
            { id: 'meeting' as BehaviorMode, label: 'Meeting', sub: 'Silent Prompts' },
          ].map((m) => {
            const isActive = telemetry.activeMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChangeMode(m.id)}
                className={`px-5 py-2.5 rounded-full text-left flex items-center gap-2.5 transition-all duration-150 ease-out cursor-pointer min-w-0 ${
                  isMinimal
                    ? isDark
                      ? isActive
                        ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] border border-white/25 shadow-[0_6px_18px_-4px_rgba(255,122,26,0.28)] -translate-y-0.5'
                        : 'bg-white/[0.06] hover:bg-white/[0.12] text-[#F5EDE4] border border-white/[0.12]'
                      : isActive
                      ? 'bg-[#111827] text-white border border-[#111827] shadow-[0_6px_18px_-4px_rgba(15,23,42,0.18)] -translate-y-0.5'
                      : 'bg-white/75 hover:bg-white text-[#475569] border border-slate-200/80'
                    : isDark
                    ? isActive
                      ? 'bg-[#D4FF3F] text-[#0D0D0D] border-2 border-[#0D0D0D] shadow-[3px_3px_0px_#0D0D0D] -translate-y-0.5'
                      : 'bg-[#F7F5EE] hover:bg-white text-[#0D0D0D] border-2 border-[#0D0D0D] shadow-[2px_2px_0px_#0D0D0D]'
                    : isActive
                    ? 'bg-[#FFD84D] text-black border-2 border-black shadow-[3px_3px_0px_#000000] -translate-y-0.5'
                    : 'bg-white hover:bg-[#FFF8ED] text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-dm text-xs font-bold leading-tight truncate">{m.label}</span>
                  <span className="font-dm text-[10px] font-semibold uppercase opacity-75 truncate">
                    {m.sub}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================== */}
      {/* EYE FATIGUE & OCULAR TELEMETRY TREND SECTION (RECHARTS) */}
      {/* ============================================================== */}
      <div
        key="dashboard-activity-trends"
        className={`iris-stagger-5 relative z-10 tactile-card-white ${
          isMinimal ? 'p-7 sm:p-8' : 'p-6 sm:p-7'
        } min-w-0 box-border`}
      >
        {/* Header with Metric & Time Scope Toggle Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b-2 border-black">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 tactile-icon-tile">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-cormorant text-2xl font-bold tracking-tight">
                  Activity Trends
                </h3>
                {timeScope === 'live' && (
                  <span className="glass-badge">
                    <span className="w-2 h-2 rounded-full bg-[var(--theme-accent,#7B5CD6)] animate-ping" />
                    Live Samples ({livePoints.length})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Metric Filter Tabs & Time Scope Buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Time Scope Toggle: 7-Day vs Live Monitored */}
            <div
              className={
                isMinimal
                  ? isDark
                    ? 'flex items-center bg-white/[0.06] p-1 rounded-full border border-white/[0.12]'
                    : 'flex items-center bg-slate-100/85 p-1 rounded-full border border-slate-200/80'
                  : isDark
                  ? 'flex items-center bg-[#141414] p-1 rounded-full border-2 border-[#F5F5F0]'
                  : 'flex items-center bg-[#FFF8ED] p-1 rounded-full border-2 border-black'
              }
            >
              <button
                type="button"
                onClick={() => setTimeScope('week')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-dm transition-all cursor-pointer ${
                  isMinimal
                    ? timeScope === 'week'
                      ? isDark
                        ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] font-semibold'
                        : 'bg-[#111827] text-white font-semibold shadow-2xs'
                      : 'opacity-75 hover:opacity-100 font-medium'
                    : timeScope === 'week'
                    ? isDark
                      ? 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)] font-extrabold border-2 border-[#0D0D0D]'
                      : 'bg-[#FFD84D] text-black font-extrabold border-2 border-black shadow-[2px_2px_0px_#000000]'
                    : 'opacity-80 hover:opacity-100 font-extrabold border-2 border-transparent'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setTimeScope('live')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-dm transition-all cursor-pointer ${
                  isMinimal
                    ? timeScope === 'live'
                      ? isDark
                        ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] font-semibold'
                        : 'bg-[#111827] text-white font-semibold shadow-2xs'
                      : 'opacity-75 hover:opacity-100 font-medium'
                    : timeScope === 'live'
                    ? isDark
                      ? 'bg-[#FF8A1F] text-[#0D0D0D] font-extrabold border-2 border-[#0D0D0D]'
                      : 'bg-[#FF851B] text-black font-extrabold border-2 border-black shadow-[2px_2px_0px_#000000]'
                    : 'opacity-80 hover:opacity-100 font-extrabold border-2 border-transparent'
                }`}
              >
                Live
              </button>
            </div>

            {/* Metric Selector Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'fatigue' as const, label: `Fatigue (${telemetry.fatigueScore ?? '--'})`, vividBg: 'bg-[#FF851B]', darkVividBg: 'bg-[#FF8A1F]' },
                { id: 'blink' as const, label: `Blink Rate (${telemetry.avgBlinkRate ?? '--'}/m)`, vividBg: 'bg-[#C77DFF]', darkVividBg: 'bg-[#B968F0]' },
                { id: 'distance' as const, label: `Distance (${telemetry.avgScreenDistance ?? '--'}cm)`, vividBg: 'bg-[#25D6C1]', darkVividBg: 'bg-[#25D6C1]' },
                { id: 'all' as const, label: 'All', vividBg: 'bg-[#55C7F2]', darkVividBg: 'bg-[#55C7F2]' },
              ].map((tab) => {
                const isSelected = activeMetric === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveMetric(tab.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-dm transition-all cursor-pointer ${
                      isMinimal
                        ? isDark
                          ? isSelected
                            ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] font-semibold border border-white/25 shadow-xs'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] text-[#F5EDE4] font-medium border border-white/[0.12]'
                          : isSelected
                          ? 'bg-[#111827] text-white font-semibold border border-[#111827] shadow-[0_4px_12px_-2px_rgba(15,23,42,0.16)]'
                          : 'bg-white/75 hover:bg-white text-[#475569] font-medium border border-slate-200/80'
                        : isDark
                        ? isSelected
                          ? `${tab.darkVividBg} text-[#0D0D0D] font-extrabold border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]`
                          : 'bg-[#262626] text-[#F5F5F0] font-extrabold border-2 border-[#F5F5F0] hover:bg-[#323232]'
                        : isSelected
                        ? `${tab.vividBg} text-black font-extrabold border-2 border-black shadow-[2px_2px_0px_#000000]`
                        : 'bg-[#FFF8ED] text-black font-extrabold border-2 border-black hover:bg-[#FFD84D]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live empty state prompt if live mode selected without camera samples */}
        {timeScope === 'live' && livePoints.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center p-6 tactile-inner rounded-2xl mt-5">
            <Radio className={`w-8 h-8 animate-pulse mb-2 ${isMinimal ? (isDark ? 'text-[var(--theme-accent,#FF7A1A)]' : 'text-[#7B5CD6]') : 'text-[#FF851B]'}`} />
            <h4 className="font-dm text-base font-bold">
              No Live Readings Yet
            </h4>
            <p className="font-dm text-xs opacity-80 max-w-md mt-1 mb-4">
              Start monitoring to see live measurements.
            </p>
            <Button
              variant="primary"
              size="sm"
              pill={true}
              onClick={onToggleMonitoring}
              leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
            >
              Start Monitoring
            </Button>
          </div>
        ) : (
          /* Recharts Line Chart Container */
          <div className="w-full h-64 sm:h-72 mt-5 min-w-0 p-4 rounded-2xl tactile-inner">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData as any[]}
                margin={{ top: 15, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={chartGridColor}
                  vertical={false}
                />
                <XAxis
                  dataKey={timeScope === 'live' ? 'timeStr' : 'day'}
                  stroke={chartAxisColor}
                  tickLine={false}
                  axisLine={{ stroke: chartAxisLineColor, strokeWidth: isMinimal ? 1 : 2 }}
                  tick={{ fontSize: 11, fill: chartAxisColor, fontWeight: isMinimal ? 500 : 700 }}
                />

                {activeMetric === 'fatigue' && (
                  <YAxis
                    domain={[0, 7]}
                    stroke={chartAxisColor}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: chartAxisColor, fontWeight: isMinimal ? 500 : 700 }}
                    tickFormatter={(val) => `${val}`}
                  />
                )}
                {activeMetric === 'blink' && (
                  <YAxis
                    domain={[0, 30]}
                    stroke={chartAxisColor}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: chartAxisColor, fontWeight: isMinimal ? 500 : 700 }}
                    tickFormatter={(val) => `${val}/m`}
                  />
                )}
                {activeMetric === 'distance' && (
                  <YAxis
                    domain={[20, 80]}
                    stroke={chartAxisColor}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: chartAxisColor, fontWeight: isMinimal ? 500 : 700 }}
                    tickFormatter={(val) => `${val}cm`}
                  />
                )}
                {activeMetric === 'all' && (
                  <YAxis
                    domain={[0, 60]}
                    stroke={chartAxisColor}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: chartAxisColor, fontWeight: isMinimal ? 500 : 700 }}
                  />
                )}

                <Tooltip content={<CustomTooltip />} />

                {activeMetric === 'fatigue' && (
                  <>
                    <ReferenceLine
                      y={4.0}
                      stroke="#FF851B"
                      strokeDasharray="4 4"
                      strokeWidth={isMinimal ? 1.5 : 2}
                      label={{
                        value: 'High Strain Risk (4.0)',
                        position: 'insideTopRight',
                        fill: '#FF851B',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    />
                    <ReferenceLine
                      y={2.5}
                      stroke={primaryAccentHex}
                      strokeDasharray="3 3"
                      strokeWidth={1.5}
                      label={{
                        value: 'Target Range (≤ 2.5)',
                        position: 'insideBottomRight',
                        fill: primaryAccentHex,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    />
                  </>
                )}

                {activeMetric === 'blink' && (
                  <ReferenceLine
                    y={14}
                    stroke={primaryAccentHex}
                    strokeDasharray="3 3"
                    strokeWidth={isMinimal ? 1.5 : 2}
                    label={{
                      value: 'Min Target (14/min)',
                      position: 'insideBottomRight',
                      fill: primaryAccentHex,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                )}

                {activeMetric === 'distance' && (
                  <ReferenceLine
                    y={52}
                    stroke={primaryAccentHex}
                    strokeDasharray="3 3"
                    strokeWidth={isMinimal ? 1.5 : 2}
                    label={{
                      value: 'Target Distance (50cm+)',
                      position: 'insideTopRight',
                      fill: primaryAccentHex,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  />
                )}

                {(activeMetric === 'fatigue' || activeMetric === 'all') && (
                  <Line
                    name="Eye Fatigue (0-10)"
                    type="monotone"
                    dataKey={timeScope === 'live' ? 'fatigueScore' : 'fatigue'}
                    stroke="#FF851B"
                    strokeWidth={isMinimal ? 2.5 : 3.5}
                    dot={{
                      r: 4.5,
                      fill: isMinimal ? (isDark ? '#1D140F' : '#FFFFFF') : '#FF851B',
                      stroke: '#FF851B',
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6.5,
                      fill: '#FF851B',
                      stroke: isDark ? '#FFFFFF' : '#000000',
                      strokeWidth: 2,
                    }}
                    animationDuration={600}
                  />
                )}

                {(activeMetric === 'blink' || activeMetric === 'all') && (
                  <Line
                    name="Blink Rate (bpm)"
                    type="monotone"
                    dataKey="blinkRate"
                    stroke={isMinimal ? primaryAccentHex : isDark ? '#B968F0' : '#C77DFF'}
                    strokeWidth={isMinimal ? 2.5 : 3.5}
                    dot={{
                      r: 4.5,
                      fill: isMinimal ? (isDark ? '#1D140F' : '#FFFFFF') : isDark ? '#B968F0' : '#C77DFF',
                      stroke: isMinimal ? primaryAccentHex : isDark ? '#F5F5F0' : '#000000',
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6.5,
                      fill: primaryAccentHex,
                      stroke: isDark ? '#F5F5F0' : '#000000',
                      strokeWidth: 2,
                    }}
                    animationDuration={600}
                  />
                )}

                {(activeMetric === 'distance' || activeMetric === 'all') && (
                  <Line
                    name="Distance (cm)"
                    type="monotone"
                    dataKey="distanceCm"
                    stroke={isMinimal ? (isDark ? '#60A5FA' : '#3B82F6') : '#25D6C1'}
                    strokeWidth={isMinimal ? 2.5 : 3.5}
                    dot={{
                      r: 4.5,
                      fill: isMinimal ? (isDark ? '#1D140F' : '#FFFFFF') : '#25D6C1',
                      stroke: isMinimal ? (isDark ? '#60A5FA' : '#3B82F6') : '#25D6C1',
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6.5,
                      fill: isMinimal ? (isDark ? '#60A5FA' : '#3B82F6') : '#25D6C1',
                      stroke: isDark ? '#F5F5F0' : '#000000',
                      strokeWidth: 2,
                    }}
                    animationDuration={600}
                  />
                )}

                {activeMetric === 'all' && <Legend verticalAlign="top" height={36} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Insight Footer showing collected telemetry summaries */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t-2 border-black">
          <div
            className={
              isMinimal
                ? 'p-4 rounded-2xl tactile-inner flex items-center justify-between'
                : isDark
                ? 'p-4 rounded-2xl bg-[#FF8A1F] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] flex items-center justify-between text-[#0D0D0D]'
                : 'p-4 rounded-2xl bg-[#FF851B] border-2 border-black shadow-[3px_3px_0px_#000000] flex items-center justify-between text-black'
            }
          >
            <div>
              <span className="font-dm text-[10px] opacity-75 uppercase font-bold tracking-wider block">
                {timeScope === 'live' ? 'Current Fatigue Index' : '7-Day Fatigue Index'}
              </span>
              <span className="font-dm text-sm font-bold mt-0.5 block tabular-nums">
                Avg {avgFatigue} / 10 · Peak {maxFatigue}
              </span>
            </div>
            <TrendingUp className={`w-5 h-5 shrink-0 ${isMinimal ? 'text-[#FF7A1A]' : isDark ? 'text-[#0D0D0D]' : 'text-black'}`} />
          </div>

          <div
            className={
              isMinimal
                ? 'p-4 rounded-2xl tactile-inner flex items-center justify-between'
                : isDark
                ? 'p-4 rounded-2xl bg-[#B968F0] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] flex items-center justify-between text-[#0D0D0D]'
                : 'p-4 rounded-2xl bg-[#C77DFF] border-2 border-black shadow-[3px_3px_0px_#000000] flex items-center justify-between text-black'
            }
          >
            <div>
              <span className="font-dm text-[10px] opacity-75 uppercase font-bold tracking-wider block">
                Collected Blink Rate
              </span>
              <span className="font-dm text-sm font-bold mt-0.5 block tabular-nums">
                Weekly Mean: {avgBlinkRate} blinks/min
              </span>
            </div>
            <Eye className={`w-5 h-5 shrink-0 ${isMinimal ? (isDark ? 'text-[var(--theme-accent,#FF7A1A)]' : 'text-[#7B5CD6]') : isDark ? 'text-[#0D0D0D]' : 'text-black'}`} />
          </div>

          <div
            className={
              isMinimal
                ? 'p-4 rounded-2xl tactile-inner flex items-center justify-between'
                : isDark
                ? 'p-4 rounded-2xl bg-[#25D6C1] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] flex items-center justify-between text-[#0D0D0D]'
                : 'p-4 rounded-2xl bg-[#25D6C1] border-2 border-black shadow-[3px_3px_0px_#000000] flex items-center justify-between text-black'
            }
          >
            <div>
              <span className="font-dm text-[10px] opacity-75 uppercase font-bold tracking-wider block">
                Collected Distance
              </span>
              <span className="font-dm text-sm font-bold mt-0.5 block tabular-nums">
                Weekly Mean: {avgDistance} cm
              </span>
            </div>
            <CheckCircle2 className={`w-5 h-5 shrink-0 ${isMinimal ? (isDark ? 'text-[#60A5FA]' : 'text-[#3B82F6]') : isDark ? 'text-[#0D0D0D]' : 'text-black'}`} />
          </div>
        </div>
      </div>

      {/* Daily Eye Wellness Target Progress Ring (Breaks Remaining) */}
      <div key="dashboard-breaks-remaining" className="relative z-10 w-full">
        <DailyProgressRing progress={telemetry.dayProgress} />
      </div>

      {/* Weekly Consistency Tracker: Break adherence over last 7 days */}
        <div
          key="dashboard-weekly-consistency"
        className={`relative z-10 w-full tactile-card-blue ${
            isMinimal ? 'p-6 sm:p-8' : 'p-5 sm:p-6'
          } transition-all min-w-0 box-border`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b-2 border-black min-w-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 tactile-icon-tile">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-cormorant text-2xl font-bold truncate">
                    Weekly Consistency
                  </h2>
                  <span className="text-xs font-dm font-semibold opacity-75">
                    · Breaks
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3.5 self-start sm:self-auto flex-wrap shrink-0">
              <div className="flex items-baseline gap-1.5 px-3.5 py-1.5 rounded-2xl tactile-inner">
                <span className="font-dm text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
                  {avgAdherence}%
                </span>
                <span className="font-dm text-xs font-semibold opacity-80">
                  7-Day Avg
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 px-3.5 py-1.5 rounded-2xl tactile-inner">
                <span className="font-dm text-lg font-bold tabular-nums">
                  {adherenceStreak}/7
                </span>
                <span className="font-dm text-xs font-semibold opacity-80">
                  Days on Target
                </span>
              </div>
              <Button
                variant="primary"
                size="sm"
                pill={true}
                disabled={isDailyBreakLimitReached}
                leftIcon={<Play className="w-3 h-3 fill-current" />}
                onClick={() => {
                  if (!isDailyBreakLimitReached) {
                    onOpenBreakModal();
                  }
                }}
                className="text-xs shrink-0"
              >
                {isDailyBreakLimitReached ? 'Daily Limit Reached' : 'Start Break'}
              </Button>
            </div>
          </div>

          {/* 7-Day Line Chart */}
          <div className="pt-4 min-w-0">
            <div className="h-32 sm:h-36 w-full p-3 rounded-2xl tactile-inner">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={weeklyConsistencyData}
                  margin={{ top: 8, right: 12, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={weeklyChartGridColor}
                  />
                  <XAxis
                    dataKey="day"
                    tick={{
                      fontSize: 11,
                      fill: weeklyChartAxisColor,
                      fontFamily: 'DM Sans',
                      fontWeight: isMinimal ? 500 : 700,
                    }}
                    axisLine={{ stroke: weeklyChartAxisLineColor, strokeWidth: isMinimal ? 1 : 2 }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[50, 100]}
                    ticks={[60, 80, 100]}
                    tick={{
                      fontSize: 10,
                      fill: weeklyChartAxisColor,
                      fontFamily: 'DM Sans',
                      fontWeight: isMinimal ? 500 : 700,
                    }}
                    axisLine={false}
                    tickLine={false}
                    unit="%"
                  />
                  <ReferenceLine
                    y={80}
                    stroke={isMinimal ? primaryAccentHex : '#FF851B'}
                    strokeDasharray="4 4"
                    strokeWidth={isMinimal ? 1.5 : 2}
                    label={{
                      value: 'Target (80%)',
                      position: 'insideTopLeft',
                      fill: isMinimal ? primaryAccentHex : isDark ? '#0D0D0D' : '#000000',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                  <Tooltip content={<WeeklyConsistencyTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="adherence"
                    name="Breaks completed"
                    stroke={isMinimal ? primaryAccentHex : isDark ? '#0D0D0D' : '#000000'}
                    strokeWidth={isMinimal ? 2.5 : 3}
                    dot={{
                      r: 4.5,
                      fill: isMinimal ? (isDark ? '#1D140F' : '#FFFFFF') : '#FF851B',
                      stroke: isMinimal ? primaryAccentHex : isDark ? '#0D0D0D' : '#000000',
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 6.5,
                      fill: isMinimal ? primaryAccentHex : isDark ? '#D4FF3F' : '#FFD84D',
                      stroke: isMinimal ? '#FFFFFF' : '#000000',
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Bottom 7-day mini ticker */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5 mt-3 pt-3 text-center">
              {weeklyConsistencyData.map((d, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center p-2.5 rounded-xl tactile-inner"
                >
                  <span className="text-[10px] opacity-70 font-bold font-dm uppercase tracking-wider">
                    {d.day}
                  </span>
                  <span className="text-xs font-bold font-dm mt-0.5 tabular-nums">
                    {d.adherence}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      {/* Hardware Telemetry Status Strip */}
      <div key="dashboard-status-strip"
        className="relative z-10 pt-2 px-2 flex flex-col md:flex-row md:items-center justify-between gap-3 font-dm text-xs font-bold tracking-wider uppercase min-w-0 box-border">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isMinimal ? (isDark ? 'bg-[var(--theme-accent,#FF7A1A)]' : 'bg-[#7B5CD6]') : isDark ? 'border border-[#F5F5F0] bg-[#25D6C1]' : 'border border-black bg-[#25D6C1]'
              } ${isMonitoring ? 'animate-pulse' : ''}`}
            />
            <span className="whitespace-nowrap tabular-nums">CAMERA: {telemetry.cameraFps} FPS (ON-DEVICE)</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                isMinimal ? 'bg-[#FF7A1A]' : isDark ? 'bg-[#FF8A1F] border border-[#F5F5F0]' : 'bg-[#FF851B] border border-black'
              }`}
            />
            <span className="whitespace-nowrap tabular-nums">
              TRACKED TIME: {Math.floor(telemetry.observationSeconds / 60)}M {Math.round(telemetry.observationSeconds % 60)}S
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                isMinimal ? (isDark ? 'bg-[var(--theme-accent,#FF7A1A)]' : 'bg-[#7B5CD6]') : isDark ? 'bg-[#B968F0] border border-[#F5F5F0]' : 'bg-[#C77DFF] border border-black'
              }`}
            />
            <span className="whitespace-nowrap tabular-nums">BLINKS: {telemetry.totalBlinksDetected}</span>
          </div>
        </div>
      </div>
    </div>
  );
};