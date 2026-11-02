import React from 'react';
import {
  Video,
  Layers,
  RefreshCw,
  Glasses,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  X,
  Sparkles,
} from 'lucide-react';
import { CameraStreamDiagnostics, CameraAccessMode } from '../types';

interface CameraCompatibilityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics: CameraStreamDiagnostics;
  isGlassesMode: boolean;
  onToggleGlassesMode: () => void;
  onResetRecovery: () => void;
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  onOpenCalibration?: () => void;
  isDark?: boolean;
  isLiquidGlass?: boolean;
}

export const CameraCompatibilityPanel: React.FC<CameraCompatibilityPanelProps> = ({
  isOpen,
  onClose,
  diagnostics,
  isGlassesMode,
  onToggleGlassesMode,
  onResetRecovery,
  isMonitoring,
  onToggleMonitoring,
  onOpenCalibration,
  isDark = true,
  isLiquidGlass = false,
}) => {
  if (!isOpen) return null;

  const getModeBadge = (mode: CameraAccessMode) => {
    switch (mode) {
      case 'SHARED_FRAME_SERVER':
        return {
          label: 'Shared Mode (Windows Frame Server)',
          bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
          dot: 'bg-emerald-400 animate-pulse',
          desc: 'Simultaneous multi-application sharing enabled. Zoom, Teams, and Meet can run concurrently without seizing your webcam.',
        };
      case 'RECOVERING':
        return {
          label: 'Recovering Shared Stream...',
          bg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
          dot: 'bg-amber-400 animate-ping',
          desc: `Cooperative pause active. Retrying handshake every 3s (Attempt ${diagnostics.retryAttempts}/3).`,
        };
      case 'STANDBY_EXCLUSIVE_LOCK':
        return {
          label: 'Standby (Exclusive External Lock)',
          bg: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
          dot: 'bg-rose-500',
          desc: 'Another application seized exclusive camera hardware lock. IRIS is actively probing in background every 8s to auto-reconnect.',
        };
      case 'EXCLUSIVE':
      default:
        return {
          label: 'Direct Hardware Capture',
          bg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',
          dot: 'bg-cyan-400',
          desc: 'Exclusive video feed active.',
        };
    }
  };

  const modeInfo = getModeBadge(diagnostics.cameraMode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md animate-fade-in">
      <div
        className={`w-full max-w-2xl rounded-2xl border p-6 sm:p-7 shadow-2xl relative overflow-hidden transition-all ${
          isLiquidGlass
            ? 'bg-[#0f172a]/80 border-cyan-500/30 text-white backdrop-blur-xl shadow-cyan-500/10'
            : isDark
            ? 'bg-[#121316] border-[#2A2B32] text-white shadow-black/80'
            : 'bg-white border-black text-black shadow-xl'
        }`}
      >
        {/* Glow ambient background highlight */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-5 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-syne font-bold text-lg sm:text-xl tracking-tight">
                  Camera Compatibility & Vision Status
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Shared Feed
                </span>
              </div>
              <p className="font-dm text-xs text-white/60 mt-0.5">
                Cooperative multi-app webcam sharing & vision calibration diagnostics
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-white/10 hover:bg-white/10 flex items-center justify-center transition-colors text-white/70 hover:text-white"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-5 space-y-4 max-h-[70vh] overflow-y-auto pr-1 relative z-10 custom-scrollbar">
          {/* Section 1: Windows Frame Server Shared Mode Status */}
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span className="font-dm font-semibold text-sm">Webcam Access Architecture</span>
              </div>
              <div className={`px-2.5 py-1 rounded-full border flex items-center gap-2 text-xs font-semibold ${modeInfo.bg}`}>
                <span className={`w-2 h-2 rounded-full ${modeInfo.dot}`} />
                <span>{modeInfo.label}</span>
              </div>
            </div>
            <p className="font-dm text-xs text-white/70 leading-relaxed">
              {modeInfo.desc}
            </p>

            {/* Live stream specifications */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10 text-xs font-mono">
              <div className="bg-black/30 rounded-lg p-2.5 border border-white/5">
                <span className="text-white/50 block text-[10px] font-sans">Resolution</span>
                <span className="font-bold text-white">
                  {diagnostics.width > 0 ? `${diagnostics.width}x${diagnostics.height}` : 'Standby'}
                </span>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 border border-white/5">
                <span className="text-white/50 block text-[10px] font-sans">Target FPS</span>
                <span className="font-bold text-white">
                  {diagnostics.fps > 0 ? `${diagnostics.fps} FPS` : '20-24 FPS'}
                </span>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 border border-white/5">
                <span className="text-white/50 block text-[10px] font-sans">Track Status</span>
                <span className={`font-bold ${diagnostics.isMuted ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {diagnostics.isMuted ? 'Muted (Paused)' : isMonitoring ? 'Live' : 'Idle'}
                </span>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 border border-white/5">
                <span className="text-white/50 block text-[10px] font-sans">Recovery</span>
                <span className="font-bold text-cyan-300">
                  {diagnostics.retryAttempts === 0 ? 'Optimal' : `Retry #${diagnostics.retryAttempts}`}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Multi-App Concurrency & Detected Video Apps */}
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="font-dm font-semibold text-sm">Concurrent Applications</span>
              </div>
              {diagnostics.concurrentAppName ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/20 border border-purple-500/30 text-purple-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  {diagnostics.concurrentAppName} Active
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 border border-white/15 text-white/70">
                  No Conflicting Video Apps
                </span>
              )}
            </div>

            <p className="font-dm text-xs text-white/70 leading-relaxed">
              {diagnostics.concurrentAppName ? (
                <span>
                  IRIS detected <strong className="text-white">{diagnostics.concurrentAppName}</strong> running. IRIS operates in non-exclusive shared mode, maintaining real-time posture and blink detection without interrupting your call.
                </span>
              ) : (
                <span>
                  Compatible with <strong>Zoom, Microsoft Teams, Google Meet, OBS Studio, Discord</strong>, and the Windows Camera app. When another app starts, IRIS cooperatively coordinates to prevent exclusive USB bus lockouts.
                </span>
              )}
            </p>
          </div>

          {/* Section 3: Glasses-Optimized Vision Threshold Upgrade */}
          <div className={`p-4 rounded-xl border transition-all ${
            isGlassesMode
              ? 'bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-cyan-500/10 border-amber-500/40'
              : 'border-white/10 bg-white/5'
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                  isGlassesMode ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-white/5 border-white/10 text-white/60'
                }`}>
                  <Glasses className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-dm font-semibold text-sm">Glasses-Optimized Detection</span>
                    {isGlassesMode && (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className="font-dm text-xs text-white/60">
                    Upgraded threshold sensitivity for users wearing eyeglasses or spectacles
                  </p>
                </div>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                onClick={onToggleGlassesMode}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isGlassesMode ? 'bg-amber-500' : 'bg-white/20'
                }`}
                role="switch"
                aria-checked={isGlassesMode}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isGlassesMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-white/10 text-xs space-y-1.5 text-white/70">
              <div className="flex items-center justify-between text-[11px]">
                <span>Eyelid Closure Threshold:</span>
                <span className="font-mono font-bold text-white">
                  {isGlassesMode ? '12.5% drop (Glasses Tuned)' : '16.0% drop (Standard)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span>Blendshape Reflection Filter:</span>
                <span className="font-mono font-bold text-white">
                  {isGlassesMode ? '0.30 sensitivity (Compensated)' : '0.42 sensitivity'}
                </span>
              </div>
              <p className="text-[11px] text-white/50 pt-1">
                Compensates for frame shadows, specular reflections, and lens edge refraction to guarantee every natural blink is detected accurately.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between flex-wrap gap-3 relative z-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onResetRecovery}
              className="px-3.5 py-1.5 rounded-full text-xs font-dm font-semibold border border-white/20 hover:bg-white/10 flex items-center gap-1.5 transition-colors"
              title="Re-sync camera and clear recovery countdown"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Re-sync Stream</span>
            </button>

            {onOpenCalibration && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCalibration();
                }}
                className="px-3.5 py-1.5 rounded-full text-xs font-dm font-semibold border border-white/20 hover:bg-white/10 flex items-center gap-1.5 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <span>Calibrate Distance</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-full text-xs font-dm font-semibold bg-white text-black hover:bg-white/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
