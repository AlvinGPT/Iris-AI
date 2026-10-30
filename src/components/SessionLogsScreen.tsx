import React, { useState } from 'react';
import {
  Calendar,
  Download,
  Play,
  Trash2,
  Camera,
  Activity,
  CheckCircle2,
  Clock,
  Radio,
} from 'lucide-react';
import { EyeBreakLog, TelemetryState } from '../types';
import { Button } from './ui/Button';
import { TelemetryStorageService } from '../services/telemetryStorage';
import { OcureDailyPlanService } from '../services/ocureService';
import { useTheme } from '../context/ThemeContext';

interface SessionLogsScreenProps {
  logs: EyeBreakLog[];
  onOpenBreakModal: () => void;
  isMonitoring?: boolean;
  onToggleMonitoring?: () => void;
  telemetry?: TelemetryState;
  onLogManualSession?: (type: string, durationSeconds?: number) => void;
  onClearLogs?: () => void;
}

export const SessionLogsScreen: React.FC<SessionLogsScreenProps> = ({
  logs,
  onOpenBreakModal,
  isMonitoring = false,
  onToggleMonitoring,
  telemetry,
  onLogManualSession,
  onClearLogs,
}) => {
  const { isMinimal, isDark } = useTheme();
  const [filter, setFilter] = useState<string>('All');
  const isDailyBreakLimitReached = !OcureDailyPlanService.canStartBreakToday();

  const hourlyData = TelemetryStorageService.getHourlyGazeDistribution(logs);
  const activeHoursWithData = hourlyData.filter((h) => h.hasData);
  const overallAvgBlink =
    activeHoursWithData.length > 0
      ? Math.round(activeHoursWithData.reduce((acc, h) => acc + h.val, 0) / activeHoursWithData.length)
      : telemetry?.avgBlinkRate || 16;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'All') return true;
    if (filter === 'Breaks')
      return (
        log.type.toLowerCase().includes('break') ||
        log.type.toLowerCase().includes('routine') ||
        log.type.toLowerCase().includes('rest')
      );
    if (filter === 'Tracking' || filter === 'Webcam Tracking')
      return (
        log.type.toLowerCase().includes('webcam') ||
        log.type.toLowerCase().includes('camera') ||
        log.type.toLowerCase().includes('tracking') ||
        log.type.toLowerCase().includes('audit')
      );
    if (filter === 'Alerts' || filter === 'Ergonomic Alerts' || filter === 'Distance Alerts')
      return (
        log.type.toLowerCase().includes('warning') ||
        log.type.toLowerCase().includes('alert') ||
        log.type.toLowerCase().includes('proximity') ||
        log.type.toLowerCase().includes('lock-in')
      );
    return true;
  });

  const [showExportNotification, setShowExportNotification] = useState(false);

  const exportCSV = () => {
    if (logs.length === 0) return;
    const headers = [
      'Timestamp',
      'Exercise Routine / Event',
      'Duration (s)',
      'Compliance (%)',
      'Status',
      'Blink Rate (/min)',
      'Distance (cm)',
      'Fatigue (/10)',
      'Audited Notes',
    ];
    const rows = logs.map((l) => [
      `"${l.time}"`,
      `"${l.type}"`,
      l.durationSeconds,
      `${l.complianceScore}%`,
      `"${l.status}"`,
      l.telemetrySnapshot?.blinkRate || 'N/A',
      l.telemetrySnapshot?.distanceCm || 'N/A',
      l.telemetrySnapshot?.fatigueScore || 'N/A',
      `"${(l.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `iris_accurate_telemetry_logs_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setShowExportNotification(true);
    setTimeout(() => {
      setShowExportNotification(false);
    }, 4000);
  };

  const dividerClass = isMinimal
    ? isDark
      ? 'border-b border-white/12'
      : 'border-b border-slate-900/10'
    : isDark
    ? 'border-b-2 border-[#F5F5F0]'
    : 'border-b-2 border-black';

  return (
    <div className="relative w-full tactile-card-white p-6 lg:p-8 overflow-hidden min-w-0 box-border">
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 ${dividerClass}`}>
        <div>
          <div className="flex items-center gap-2 font-dm text-xs uppercase font-bold tracking-widest mb-1">
            <Calendar
              className={`w-3.5 h-3.5 ${
                isMinimal
                  ? isDark
                    ? 'text-[var(--theme-accent,#FF7A1A)]'
                    : 'text-[#7B5CD6]'
                  : isDark
                  ? 'text-[#D4FF3F]'
                  : 'text-[#FF851B]'
              }`}
            />
            <span>ACTIVITY HISTORY</span>
          </div>
          <h1 className="font-cormorant text-3xl sm:text-4xl tracking-tight font-bold">
            Session Logs
          </h1>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onClearLogs && logs.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              pill={true}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => {
                onClearLogs();
              }}
            >
              Clear Logs
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            pill={true}
            leftIcon={<Download className="w-3.5 h-3.5" />}
            onClick={exportCSV}
            disabled={logs.length === 0}
          >
            Export CSV
          </Button>

          {onLogManualSession && (
            <Button
              variant="secondary"
              size="sm"
              pill={true}
              leftIcon={<Activity className="w-3.5 h-3.5" />}
              onClick={() => onLogManualSession('Manual Check', 30)}
            >
              Log Snapshot
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            pill={true}
            disabled={isDailyBreakLimitReached}
            leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
            onClick={() => {
              if (!isDailyBreakLimitReached) {
                onOpenBreakModal();
              }
            }}
          >
            {isDailyBreakLimitReached ? 'Daily Limit Reached' : 'Start Coach Break'}
          </Button>
        </div>
      </div>

      {showExportNotification && (
        <div
          className={
            isMinimal
              ? isDark
                ? 'my-4 p-4 rounded-2xl bg-white/[0.08] border border-white/[0.15] shadow-xs flex items-center justify-between gap-3'
                : 'my-4 p-4 rounded-2xl bg-white/85 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3'
              : isDark
              ? 'my-4 p-4 rounded-2xl bg-[#25D6C1] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] text-[#0D0D0D] flex items-center justify-between gap-3'
              : 'my-4 p-4 rounded-2xl bg-[#25D6C1] border-2 border-black shadow-[3px_3px_0px_#000000] text-black flex items-center justify-between gap-3'
          }
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="font-dm text-xs font-bold">
              Logs exported as CSV.
            </span>
          </div>
          <span className="glass-badge text-[11px]">
            Ready in Downloads
          </span>
        </div>
      )}

      {/* Real-time Logger Status Banner */}
      <div className="my-5 p-4 tactile-card-orange flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 tactile-icon-tile">
            {isMonitoring ? (
              <Radio
                className={`w-5 h-5 animate-pulse ${
                  isMinimal
                    ? isDark
                      ? 'text-[var(--theme-accent,#FF7A1A)]'
                      : 'text-[#7B5CD6]'
                    : 'text-[#FF851B]'
                }`}
              />
            ) : (
              <Camera className="w-5 h-5" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-dm text-xs uppercase font-bold tracking-wider">
              {isMonitoring ? 'Monitoring Active' : 'Monitoring Paused'}
            </span>
            <span className="font-dm text-xs opacity-85 truncate">
              {isMonitoring
                ? 'Tracking is active. Breaks and alerts are recorded locally.'
                : 'Camera is paused. Logs below are saved on this device.'}
            </span>
          </div>
        </div>

        {onToggleMonitoring && (
          <button
            type="button"
            onClick={onToggleMonitoring}
            className={isMonitoring ? 'btn-pill-primary py-1.5 px-4 text-xs' : 'btn-pill-secondary py-1.5 px-4 text-xs'}
          >
            {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
          </button>
        )}
      </div>

      {/* Dynamic Hourly Gaze Distribution Visualizer */}
      <div className="my-6 p-5 tactile-card-blue">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <span className="font-dm text-xs uppercase font-bold tracking-wider block">
              Today&apos;s Hourly Blink Rate
            </span>
          </div>
          <span className="glass-badge text-xs tabular-nums">
            {activeHoursWithData.length > 0
              ? `Average: ${overallAvgBlink}/min (${activeHoursWithData.length} hrs)`
              : 'No activity yet'}
          </span>
        </div>

        <div
          className={
            isMinimal
              ? isDark
                ? 'h-36 flex items-end gap-2 sm:gap-3 pt-4 px-3 pb-2 rounded-2xl bg-black/25 border border-white/10'
                : 'h-36 flex items-end gap-2 sm:gap-3 pt-4 px-3 pb-2 rounded-2xl bg-white/65 border border-slate-200/80'
              : isDark
              ? 'h-36 flex items-end gap-2 sm:gap-3 pt-4 px-3 pb-2 rounded-2xl bg-[#F7F5EE] text-[#0D0D0D] border-2 border-[#0D0D0D]'
              : 'h-36 flex items-end gap-2 sm:gap-3 pt-4 px-3 pb-2 rounded-2xl bg-white border-2 border-black'
          }
        >
          {hourlyData.map((bar, i) => {
            const heightPercent = bar.hasData ? Math.min(100, Math.max(15, (bar.val / 22) * 100)) : 10;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer min-w-0 h-full justify-end">
                <span className="text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity truncate tabular-nums">
                  {bar.hasData ? `${bar.val}/m` : 'No data'}
                </span>
                <div
                  className={
                    isMinimal
                      ? isDark
                        ? 'w-full rounded-t-lg flex-1 flex items-end overflow-hidden bg-white/10'
                        : 'w-full rounded-t-lg flex-1 flex items-end overflow-hidden bg-slate-900/10'
                      : isDark
                      ? 'w-full rounded-t-lg flex-1 flex items-end overflow-hidden bg-white border-2 border-[#0D0D0D]'
                      : 'w-full rounded-t-lg flex-1 flex items-end overflow-hidden bg-[#FFF8ED] border-2 border-black'
                  }
                >
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 ${
                      !bar.hasData
                        ? isMinimal && isDark
                          ? 'bg-white/10'
                          : 'bg-black/10'
                        : bar.target
                        ? isMinimal
                          ? isDark
                            ? 'bg-[var(--theme-accent,#FF7A1A)]'
                            : 'bg-[#7B5CD6]'
                          : 'bg-[#25D6C1]'
                        : isMinimal
                        ? 'bg-[#E07A5F]'
                        : 'bg-[#FF851B]'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                    title={
                      bar.hasData
                        ? `${bar.hour}: ${bar.val} blinks/min (${bar.eventCount} events)`
                        : `${bar.hour}: No session recorded`
                    }
                  />
                </div>
                <span className="font-dm text-[10px] font-bold truncate tabular-nums">
                  {bar.hour}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] font-dm font-semibold pt-3 mt-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-3 h-3 rounded-sm ${
                  isMinimal
                    ? isDark
                      ? 'bg-[var(--theme-accent,#FF7A1A)]'
                      : 'bg-[#7B5CD6]'
                    : isDark
                    ? 'bg-[#25D6C1] border border-[#0D0D0D]'
                    : 'bg-[#25D6C1] border border-black'
                }`}
              />
              Optimal (≥ 14 bpm)
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`w-3 h-3 rounded-sm ${
                  isMinimal
                    ? 'bg-[#E07A5F]'
                    : isDark
                    ? 'bg-[#FF8A1F] border border-[#0D0D0D]'
                    : 'bg-[#FF851B] border border-black'
                }`}
              />
              Depressed Lock-in (&lt; 14 bpm)
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`w-3 h-3 rounded-sm ${
                  isMinimal && isDark ? 'bg-[#1D140F] border border-white/40' : isDark ? 'bg-[#F7F5EE] border border-[#0D0D0D]' : 'bg-white border border-black'
                }`}
              />
              No Monitoring Recorded
            </span>
          </div>
          <span className="hidden sm:inline font-dm text-[10px] uppercase font-bold opacity-70">
            Hover column for exact counts
          </span>
        </div>
      </div>

      {/* Filter Tabs & Log Counter */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {['All', 'Breaks', 'Tracking', 'Alerts'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-full font-dm text-xs transition-all duration-150 ease-out cursor-pointer ${
                isMinimal
                  ? filter === tab
                    ? isDark
                      ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] font-semibold border border-white/25 shadow-xs'
                      : 'bg-[#111827] text-white font-semibold border border-[#111827] shadow-xs'
                    : isDark
                    ? 'bg-white/[0.06] hover:bg-white/[0.12] text-[#B8AAA0] border border-white/[0.12] font-medium'
                    : 'bg-white/75 hover:bg-white text-[#475569] border border-slate-200/80 font-medium'
                  : filter === tab
                  ? isDark
                    ? 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)] font-extrabold border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                    : 'bg-[#FFD84D] text-black font-extrabold border-2 border-black shadow-[2px_2px_0px_#000000]'
                  : isDark
                  ? 'bg-[#262626] text-[#F5F5F0] hover:bg-[#323232] border-2 border-[#F5F5F0] font-bold'
                  : 'bg-[#FFF8ED] text-black hover:bg-[#FFD84D] border-2 border-black font-bold'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <span
          className={
            isMinimal
              ? isDark
                ? 'font-dm text-xs font-semibold uppercase tracking-wider px-3.5 py-1 rounded-full bg-white/[0.08] text-[#F5EDE4] border border-white/[0.15] tabular-nums'
                : 'font-dm text-xs font-semibold uppercase tracking-wider px-3.5 py-1 rounded-full bg-white/85 text-[#0F172A] border border-slate-200/80 shadow-2xs tabular-nums'
              : isDark
              ? 'font-dm text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-[#B968F0] text-[#0D0D0D] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] tabular-nums'
              : 'font-dm text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-[#C77DFF] text-black border-2 border-black shadow-[2px_2px_0px_#000000] tabular-nums'
          }
        >
          {filteredLogs.length} Entries
        </span>
      </div>

      {/* Table of Verified Logs */}
      {filteredLogs.length === 0 ? (
        <div
          className={
            isMinimal
              ? isDark
                ? 'py-16 text-center rounded-2xl border border-dashed border-white/20 bg-white/[0.04] p-8'
                : 'py-16 text-center rounded-2xl border border-dashed border-slate-300 bg-white/55 p-8'
              : isDark
              ? 'py-16 text-center rounded-2xl border-2 border-dashed border-[#F5F5F0] bg-[#161616] p-8'
              : 'py-16 text-center rounded-2xl border-2 border-dashed border-black bg-[#FFF8ED] p-8'
          }
        >
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-80" />
          <h3 className="font-cormorant text-xl font-bold">
            No session logs match your criteria
          </h3>
          <p className="font-dm text-xs opacity-80 max-w-md mx-auto mt-1 mb-4">
            Events appear here when tracking is active or when you complete a break.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="primary"
              size="sm"
              pill={true}
              onClick={onOpenBreakModal}
              leftIcon={<Play className="w-3 h-3 fill-current" />}
            >
              Start Coach Break
            </Button>
            {onToggleMonitoring && (
              <Button
                variant="secondary"
                size="sm"
                pill={true}
                onClick={onToggleMonitoring}
                leftIcon={<Camera className="w-3.5 h-3.5" />}
              >
                Start Monitoring
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          className={
            isMinimal
              ? isDark
                ? 'overflow-x-auto rounded-2xl border border-white/15 bg-black/20 backdrop-blur-md shadow-xs'
                : 'overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-md shadow-xs'
              : isDark
              ? 'overflow-x-auto rounded-2xl border-2 border-[#F5F5F0] bg-[#161616] shadow-[4px_4px_0px_#F5F5F0]'
              : 'overflow-x-auto rounded-2xl border-2 border-black bg-[#FFF8ED] shadow-[4px_4px_0px_#000000]'
          }
        >
          <table className="w-full text-left font-dm text-xs">
            <thead
              className={
                isMinimal
                  ? isDark
                    ? 'uppercase tracking-wider font-semibold border-b border-white/10 bg-white/[0.06] text-[var(--theme-accent,#FF7A1A)]'
                    : 'uppercase tracking-wider font-semibold border-b border-slate-200/80 bg-white/80 text-[#5B3CB5]'
                  : isDark
                  ? 'uppercase tracking-wider font-extrabold border-b-2 border-[#F5F5F0] bg-[#D4FF3F] text-[#0D0D0D]'
                  : 'uppercase tracking-wider font-extrabold border-b-2 border-black bg-[#FFD84D] text-black'
              }
            >
              <tr>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4">Event / Routine</th>
                <th className="py-3.5 px-4">Duration</th>
                <th className="py-3.5 px-4">Telemetry Snapshot</th>
                <th className="py-3.5 px-4">Compliance</th>
                <th className="py-3.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody
              className={
                isMinimal
                  ? isDark
                    ? 'divide-y divide-white/10 bg-white/[0.02]'
                    : 'divide-y divide-slate-200/70 bg-white/80'
                  : isDark
                  ? 'divide-y divide-white/15 bg-[#1F1F1F]'
                  : 'divide-y divide-black/10 bg-white/80'
              }
            >
              {filteredLogs.map((log) => {
                const isWarning = log.status === 'Warning' || log.type.toLowerCase().includes('warning');
                return (
                  <tr
                    key={log.id}
                    className={`transition-colors ${
                      isMinimal
                        ? isDark
                          ? 'hover:bg-white/5'
                          : 'hover:bg-white'
                        : isDark
                        ? 'hover:bg-white/5'
                        : 'hover:bg-white'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-bold whitespace-nowrap tabular-nums">
                      {log.time}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              isMinimal
                                ? isWarning
                                  ? 'bg-[#E07A5F]'
                                  : isDark
                                  ? 'bg-[var(--theme-accent,#FF7A1A)]'
                                  : 'bg-[#7B5CD6]'
                                : isDark
                                ? `border border-[#F5F5F0] ${isWarning ? 'bg-[#FF8A1F]' : 'bg-[#25D6C1]'}`
                                : `border border-black ${isWarning ? 'bg-[#FF851B]' : 'bg-[#25D6C1]'}`
                            }`}
                          />
                          <span className="font-bold">{log.type}</span>
                        </div>
                        {log.notes && (
                          <span className="text-[11px] opacity-75 mt-0.5 line-clamp-1">
                            {log.notes}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap font-semibold tabular-nums">
                      {log.durationSeconds > 0 ? `${log.durationSeconds}s` : 'Continuous'}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {log.telemetrySnapshot ? (
                        <div className="flex items-center gap-2 text-[11px] font-semibold tabular-nums">
                          <span>{log.telemetrySnapshot.blinkRate ?? '--'}/m</span>
                          <span>·</span>
                          <span>{log.telemetrySnapshot.distanceCm ?? '--'}cm</span>
                          <span>·</span>
                          <span>Fatigue {log.telemetrySnapshot.fatigueScore ?? '--'}</span>
                        </div>
                      ) : (
                        <span className="opacity-70">Baseline</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-16 h-2 rounded-full overflow-hidden ${
                            isDark ? 'bg-white/15 border border-white/25' : 'bg-slate-900/10 border border-black/15'
                          }`}
                        >
                          <div
                            className={`h-full rounded-full ${
                              isMinimal
                                ? isDark
                                  ? 'bg-[var(--theme-accent,#FF7A1A)]'
                                  : 'bg-[#7B5CD6]'
                                : 'bg-[#25D6C1]'
                            }`}
                            style={{ width: `${log.complianceScore}%` }}
                          />
                        </div>
                        <span className="font-bold tabular-nums">{log.complianceScore}%</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={
                          isMinimal
                            ? isDark
                              ? `font-dm text-[11px] font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                                  isWarning
                                    ? 'bg-[#E07A5F]/20 text-[#F4D0C8] border-[#E07A5F]/40'
                                    : 'bg-[var(--theme-accent,#FF7A1A)]/20 text-[var(--theme-accent,#FF7A1A)] border-[var(--theme-accent,#FF7A1A)]/40'
                                }`
                              : `font-dm text-[11px] font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                                  isWarning
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-indigo-50 text-[#5B3CB5] border-indigo-200'
                                }`
                            : isDark
                            ? `font-dm text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border-2 border-[#F5F5F0] whitespace-nowrap ${
                                isWarning ? 'bg-[#FF8A1F] text-[#0D0D0D]' : 'bg-[#25D6C1] text-[#0D0D0D]'
                              }`
                            : `font-dm text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border border-black whitespace-nowrap ${
                                isWarning ? 'bg-[#FF851B] text-black' : 'bg-[#25D6C1] text-black'
                              }`
                        }
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
