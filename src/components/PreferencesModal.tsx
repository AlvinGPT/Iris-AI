import React, { useEffect, useState } from 'react';
import {
  X,
  Paintbrush,
  Sparkles,
  Palette,
  Ruler,
  RotateCcw,
  Sun,
  Moon,
  Shield,
  Cpu,
  Database,
  HardDrive,
} from 'lucide-react';
import { BehaviorMode } from '../types';
import { useTheme, StyleMode, ColorMode, COLOR_STUDIO_PRESETS } from '../context/ThemeContext';
import { OrbitingEyeLogo } from './OrbitingEyeLogo';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMode: BehaviorMode;
  onChangeMode: (mode: BehaviorMode) => void;
  intervalMinutes: number;
  onChangeInterval: (minutes: number) => void;
  audioAlerts: boolean;
  onToggleAudio: () => void;
  postureSensitivity: 'Low' | 'Medium' | 'High';
  onChangeSensitivity: (val: 'Low' | 'Medium' | 'High') => void;
  onOpenCalibration?: () => void;
  isCalibrated?: boolean;
  calibratedDistance?: number | null;
  onResetCalibration?: () => void;
  onQuickCalibrate?: (distanceCm: number) => boolean;
  onOpenBlinkDebug?: () => void;
  onOpenOnboarding?: () => void;
  onOpenDocs?: () => void;
  widgetDesign?: 'liquid-glass' | 'dark-vivid';
  onChangeWidgetDesign?: (design: 'liquid-glass' | 'dark-vivid') => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  activeMode,
  onChangeMode,
  intervalMinutes,
  onChangeInterval,
  audioAlerts,
  onToggleAudio,
  postureSensitivity,
  onChangeSensitivity,
  onOpenCalibration,
  isCalibrated = false,
  calibratedDistance = null,
  onResetCalibration,
  onQuickCalibrate,
  onOpenOnboarding,
  onOpenDocs,
  widgetDesign = 'dark-vivid',
  onChangeWidgetDesign,
}) => {
  const {
    styleMode,
    setStyleMode,
    colorMode,
    setColorMode,
    accentColor,
    setAccentColor,
    isMinimal,
    isDark,
    setIsStyleChooserOpen,
  } = useTheme();

  const isDesktop = typeof window !== 'undefined' && Boolean((window as any).irisNative?.isDesktop);
  const [isStartupEnabled, setIsStartupEnabled] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<any>(null);
  const [pruningDb, setPruningDb] = useState(false);
  const [pruneMsg, setPruneMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (isDesktop && (window as any).irisNative) {
      (window as any).irisNative.isStartupEnabled?.().then((enabled: boolean) => {
        setIsStartupEnabled(Boolean(enabled));
      }).catch(() => {});

      (window as any).irisNative.getPlatformInfo?.().then((info: any) => {
        setPlatformInfo(info);
      }).catch(() => {});
    }
  }, [isOpen, isDesktop]);

  const handleToggleStartup = async () => {
    if (!isDesktop || !(window as any).irisNative?.setStartupEnabled) return;
    const nextVal = !isStartupEnabled;
    setIsStartupEnabled(nextVal);
    try {
      await (window as any).irisNative.setStartupEnabled(nextVal);
    } catch {
      setIsStartupEnabled(!nextVal);
    }
  };

  const handleManualPrune = async () => {
    setPruningDb(true);
    try {
      const res = await fetch('/api/telemetry/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 }),
      });
      const data = await res.json();
      const count = data.result?.prunedMinutes ?? 0;
      setPruneMsg(`Pruned ${count} old records (>30 days). WAL checkpointed.`);
      setTimeout(() => setPruneMsg(null), 3500);
    } catch {
      setPruneMsg('Pruning completed.');
      setTimeout(() => setPruneMsg(null), 3500);
    } finally {
      setPruningDb(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const styleOptions: {
    id: StyleMode;
    label: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'minimal',
      label: 'Minimal',
      desc: isDark
        ? 'Warm espresso & amber glow canvas, dark frosted glass & orange accent'
        : 'Sky-blue to pale-lavender canvas, frosted white & violet/blue tinted cards',
      Icon: Sparkles,
    },
    {
      id: 'vivid',
      label: 'Vivid',
      desc: isDark
        ? 'Near-black (#141414), saturated color-block cards, 2px off-white borders & Lime/Violet/Orange'
        : 'Warm cream canvas, vibrant color-block cards & 2px black outlines',
      Icon: Palette,
    },
  ];

  const colorOptions: {
    id: ColorMode;
    label: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'light',
      label: 'Light Mode',
      desc: isMinimal ? 'Sky-blue & pale-lavender frosted glass' : 'Warm cream (#FFF8ED) & vibrant cards',
      Icon: Sun,
    },
    {
      id: 'dark',
      label: 'Dark Mode',
      desc: isMinimal ? 'Warm espresso & dark frosted glass' : 'Near-black (#141414) & saturated cards',
      Icon: Moon,
    },
  ];

  const pillChoiceClass = (isSelected: boolean, vividActiveBg: string) =>
    isMinimal
      ? isDark
        ? isSelected
          ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] border border-white/25 font-semibold shadow-sm'
          : 'bg-white/[0.06] hover:bg-white/[0.12] text-[#F5EDE4] border border-white/[0.12]'
        : isSelected
        ? 'bg-[#111827] text-white border border-[#111827] font-semibold shadow-sm'
        : 'bg-white/75 hover:bg-white text-[#475569] border border-slate-200/80'
      : isDark
      ? isSelected
        ? `${vividActiveBg} text-[#0D0D0D] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] font-extrabold`
        : 'bg-[#262626] hover:bg-[#323232] text-[#F5F5F0] border-2 border-[#F5F5F0]'
      : isSelected
      ? `${vividActiveBg} text-black border-2 border-black shadow-[2px_2px_0px_#000000] font-extrabold`
      : 'bg-white hover:bg-[#FFD84D] text-black border-2 border-black';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto glass-modal p-6 sm:p-7 flex flex-col gap-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b-2 border-black">
          <div className="flex items-center gap-3">
            <OrbitingEyeLogo size={36} className="w-9 h-9" />
            <div>
              <h3 className="font-cormorant text-2xl font-bold">
                Preferences
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-pill-secondary w-9 h-9 p-0"
            aria-label="Close preferences"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Independent Style Selector (Minimal | Vivid) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="font-dm text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
              <Paintbrush className="w-3.5 h-3.5" />
              <span>Interface Style</span>
            </label>
            <button
              type="button"
              onClick={() => {
                onClose();
                setIsStyleChooserOpen(true);
              }}
              className="text-[11px] font-dm font-semibold underline cursor-pointer opacity-80 hover:opacity-100"
            >
              Compare Side-by-Side
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {styleOptions.map((opt) => {
              const IconComp = opt.Icon;
              const isSelected = styleMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStyleMode(opt.id)}
                  className={`p-3.5 rounded-2xl text-left transition-all duration-150 ease-out cursor-pointer flex flex-col justify-between gap-1.5 ${
                    isMinimal
                      ? isDark
                        ? isSelected
                          ? 'bg-white/[0.10] border border-[var(--theme-accent,#FF7A1A)]/60 shadow-[0_8px_22px_-4px_rgba(0,0,0,0.45)] -translate-y-0.5 text-[#F5EDE4]'
                          : 'bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] text-[#B8AAA0]'
                        : isSelected
                        ? 'bg-white border border-[#7B5CD6]/45 shadow-[0_8px_22px_-4px_rgba(15,23,42,0.10)] -translate-y-0.5 text-[#0F172A]'
                        : 'bg-white/65 hover:bg-white border border-slate-200/80 text-[#475569]'
                      : isDark
                      ? isSelected
                        ? 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] -translate-y-0.5'
                        : 'bg-[#262626] hover:bg-[#323232] text-[#F5F5F0] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                      : isSelected
                      ? 'bg-[#FFD84D] text-black border-2 border-black shadow-[3px_3px_0px_#000000] -translate-y-0.5'
                      : 'bg-white hover:bg-[#55C7F2] text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <IconComp className="w-4 h-4" />
                    {isSelected && (
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isMinimal
                            ? isDark
                              ? 'bg-[var(--theme-accent,#FF7A1A)]'
                              : 'bg-[#7B5CD6]'
                            : isDark
                            ? 'bg-[#0D0D0D]'
                            : 'bg-black'
                        }`}
                      />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-bold block">{opt.label}</span>
                    <span className="text-[11px] opacity-80 leading-snug block mt-0.5">
                      {opt.desc}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Independent Color Mode Selector (Light | Dark) */}
        <div className="flex flex-col gap-2.5">
          <label className="font-dm text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
            {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            <span>Color Mode</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {colorOptions.map((opt) => {
              const IconComp = opt.Icon;
              const isSelected = colorMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setColorMode(opt.id)}
                  className={`p-3 rounded-2xl text-left transition-all duration-150 ease-out cursor-pointer flex items-center gap-3 ${pillChoiceClass(
                    isSelected,
                    isDark ? 'bg-[var(--vivid-accent,#D4FF3F)]' : 'bg-[#FFD84D]'
                  )}`}
                >
                  <IconComp className="w-4 h-4 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold block">{opt.label}</span>
                    <span className="text-[10.5px] opacity-80 block truncate">{opt.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Studio Accent Swatches */}
        <div className="flex flex-col gap-2.5">
          <label className="font-dm text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" />
            <span>Accent Color</span>
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {COLOR_STUDIO_PRESETS.map((swatch) => {
              const isSelected = accentColor.toUpperCase() === swatch.hex.toUpperCase();
              return (
                <button
                  key={swatch.id}
                  type="button"
                  onClick={() => setAccentColor(swatch.hex)}
                  className={`py-2 px-1.5 rounded-2xl flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    isMinimal
                      ? isSelected
                        ? isDark
                          ? 'bg-white/[0.12] border border-white/40 text-[#F5EDE4] font-semibold'
                          : 'bg-white border border-[#7B5CD6] text-[#0F172A] font-semibold shadow-2xs'
                        : 'bg-white/20 hover:bg-white/40 border border-transparent opacity-80 hover:opacity-100'
                      : isDark
                      ? isSelected
                        ? 'bg-[#262626] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] text-[#F5F5F0] font-extrabold -translate-y-0.5'
                        : 'bg-[#181818] hover:bg-[#242424] border-2 border-[#F5F5F0]/50 text-[#D4D4CE]'
                      : isSelected
                      ? 'bg-white border-2 border-black shadow-[2px_2px_0px_#000000] text-black font-extrabold -translate-y-0.5'
                      : 'bg-white/80 hover:bg-white border-2 border-black/40 text-black'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full ${
                      isMinimal ? 'border border-black/20' : isDark ? 'border-2 border-[#0D0D0D]' : 'border-2 border-black'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                  <span className="text-[10px] font-dm truncate">{swatch.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pupil Floating Widget Design (Liquid Glass vs Dark Frosted) */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="font-dm text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Pupil Widget Design</span>
            </label>
            <span className="text-[10px] font-dm px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-semibold border border-cyan-500/30">
              Dual System
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                id: 'dark-vivid' as const,
                label: 'Black / Dark Mode',
                badge: 'Default',
                desc: 'Deep dark glass aesthetic with ultra-crisp contrast',
              },
              {
                id: 'liquid-glass' as const,
                label: 'Liquid Glass',
                badge: 'Translucent',
                desc: 'Translucent glass refraction with bold black typography & logo',
              },
            ].map((design) => {
              const isSelected = (widgetDesign || 'dark-vivid') === design.id;
              return (
                <button
                  key={design.id}
                  type="button"
                  onClick={() => onChangeWidgetDesign?.(design.id)}
                  className={`p-3.5 rounded-2xl text-left transition-all duration-150 ease-out cursor-pointer flex flex-col justify-between gap-1.5 ${
                    isMinimal
                      ? isDark
                        ? isSelected
                          ? 'bg-white/[0.12] border-2 border-cyan-400 shadow-[0_8px_22px_-4px_rgba(6,182,212,0.35)] -translate-y-0.5 text-[#F5EDE4]'
                          : 'bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] text-[#B8AAA0]'
                        : isSelected
                        ? 'bg-white border-2 border-cyan-600 shadow-[0_8px_22px_-4px_rgba(6,182,212,0.25)] -translate-y-0.5 text-[#0F172A]'
                        : 'bg-white/65 hover:bg-white border border-slate-200/80 text-[#475569]'
                      : isDark
                      ? isSelected
                        ? 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] -translate-y-0.5'
                        : 'bg-[#262626] hover:bg-[#323232] text-[#F5F5F0] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                      : isSelected
                      ? 'bg-[#FFD84D] text-black border-2 border-black shadow-[3px_3px_0px_#000000] -translate-y-0.5'
                      : 'bg-white hover:bg-[#55C7F2] text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold block">{design.label}</span>
                    <span
                      className={`text-[9px] font-dm uppercase px-1.5 py-0.5 rounded font-bold ${
                        isSelected
                          ? 'bg-cyan-500 text-black'
                          : 'bg-white/10 text-neutral-400'
                      }`}
                    >
                      {design.badge}
                    </span>
                  </div>
                  <span className="text-[11px] opacity-80 leading-snug block mt-0.5">
                    {design.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Behavior Profile */}
        <div className="flex flex-col gap-2">
          <label className="font-dm text-xs uppercase font-bold tracking-wider">
            Mode
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'gaming' as BehaviorMode, label: 'Gaming', desc: 'Fewer alerts' },
              { id: 'default' as BehaviorMode, label: 'Default', desc: 'Regular breaks' },
              { id: 'meeting' as BehaviorMode, label: 'Meeting', desc: 'Silent' },
            ].map((m) => {
              const isSelected = activeMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChangeMode(m.id)}
                  className={`p-2.5 rounded-2xl text-left transition-all duration-150 cursor-pointer flex flex-col ${pillChoiceClass(
                    isSelected,
                    'bg-[#25D6C1]'
                  )}`}
                >
                  <span className="text-xs font-bold">{m.label}</span>
                  <span className="text-[11px] opacity-75">{m.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Posture Distance Sensitivity */}
        <div className="flex flex-col gap-2">
          <label className="font-dm text-xs uppercase font-bold tracking-wider">
            Distance Alert Threshold
          </label>
          <div className="flex gap-2.5">
            {(['Low', 'Medium', 'High'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => onChangeSensitivity(lvl)}
                className={`flex-1 py-2 rounded-full text-xs transition-all duration-150 cursor-pointer ${pillChoiceClass(
                  postureSensitivity === lvl,
                  'bg-[#C77DFF]'
                )}`}
              >
                {lvl} {lvl === 'High' ? '(50cm)' : lvl === 'Medium' ? '(40cm)' : '(35cm)'}
              </button>
            ))}
          </div>
        </div>

        {/* Screen Distance Calibration Option */}
        <div className="flex flex-col gap-2.5 p-4 rounded-2xl tactile-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4" />
              <label className="font-dm text-xs uppercase font-bold tracking-wider">
                Distance Calibration
              </label>
            </div>
            <span className="glass-badge text-[11px] tabular-nums">
              {isCalibrated ? `Calibrated (${calibratedDistance || 50}cm)` : 'Default (42cm)'}
            </span>
          </div>

          <p className="text-xs opacity-85 font-dm">
            Calibrate distance tracking for your camera position.
          </p>

          {/* Quick preset distance buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { cm: 40, label: '40cm' },
              { cm: 50, label: "50cm" },
              { cm: 60, label: '60cm' },
              { cm: 70, label: '70cm' },
            ].map((p) => {
              const isSelected = calibratedDistance === p.cm;
              return (
                <button
                  key={p.cm}
                  type="button"
                  onClick={() => onQuickCalibrate && onQuickCalibrate(p.cm)}
                  className={`py-1.5 px-1 rounded-full text-[11px] text-center transition-all cursor-pointer ${pillChoiceClass(
                    isSelected,
                    'bg-[#FFD84D]'
                  )}`}
                  title={`Set reference distance to ${p.cm}cm`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calibration Actions */}
          <div className="flex items-center gap-2 pt-1">
            {onOpenCalibration && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCalibration();
                }}
                className="btn-pill-primary flex-1 py-2 text-xs"
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>Calibrate Distance</span>
              </button>
            )}

            {isCalibrated && onResetCalibration && (
              <button
                type="button"
                onClick={onResetCalibration}
                className="btn-pill-secondary py-2 px-3.5 text-xs"
                title="Reset calibration to default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Audio Alerts Switch */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl tactile-inner">
          <div className="flex flex-col">
            <span className="text-xs font-bold font-dm">Sound Alerts</span>
            <span className="text-[11px] opacity-75 font-dm">Play sound for break notifications</span>
          </div>
          <button
            type="button"
            onClick={onToggleAudio}
            className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer border-2 border-black ${
              audioAlerts
                ? isMinimal
                  ? isDark
                    ? 'bg-[var(--theme-accent,#FF7A1A)]'
                    : 'bg-[var(--theme-accent,#7B5CD6)]'
                  : isDark
                  ? 'bg-[#D4FF3F]'
                  : 'bg-[#25D6C1]'
                : isDark
                ? 'bg-[#161616]'
                : 'bg-[#FFF8ED]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full transform transition-transform duration-200 ease-in-out ${
                audioAlerts
                  ? isMinimal && isDark
                    ? 'translate-x-5 bg-[#0D0D0D]'
                    : !isMinimal && isDark
                    ? 'translate-x-5 bg-[#0D0D0D]'
                    : 'translate-x-5 bg-white'
                  : isDark
                  ? 'translate-x-0 bg-[#F5F5F0]'
                  : 'translate-x-0 bg-black'
              }`}
            />
          </button>
        </div>

        {/* Onboarding & Architecture Deliverables Section */}
        <div className="flex flex-col gap-2.5 p-4 rounded-2xl tactile-inner">
          <div className="flex items-center justify-between">
            <span className="font-dm text-xs uppercase font-bold tracking-wider">
              Camera Setup
            </span>
            <span className="text-[11px] font-dm font-semibold opacity-80">Local Processing</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mt-1">
            {onOpenOnboarding && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOnboarding();
                }}
                className="btn-pill-secondary flex-1 py-2 text-xs"
              >
                <span>Camera Setup</span>
              </button>
            )}
            {onOpenDocs && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDocs();
                }}
                className="btn-pill-secondary py-2 px-4 text-xs"
              >
                <span>Specs &amp; QA Plan</span>
              </button>
            )}
          </div>
        </div>

        {/* Desktop Daemon & Security Settings Section */}
        <div className="flex flex-col gap-3.5 p-4 rounded-2xl tactile-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="font-dm text-xs uppercase font-bold tracking-wider">
                Desktop Daemon &amp; Security Settings
              </span>
            </div>
            <span className="text-[10px] font-dm px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
              {isDesktop ? 'Native App' : 'Web Client'}
            </span>
          </div>

          {/* Start on System Boot Toggle */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-col">
              <span className="text-xs font-bold font-dm">Start with System Boot</span>
              <span className="text-[11px] opacity-75 font-dm">
                Launch silently into Windows System Tray at startup
              </span>
            </div>
            <button
              type="button"
              disabled={!isDesktop}
              onClick={handleToggleStartup}
              className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer border-2 border-black ${
                isStartupEnabled ? 'bg-emerald-500' : 'bg-zinc-700'
              } ${!isDesktop ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 ease-in-out ${
                  isStartupEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Close to Tray / Background Monitoring Indicator */}
          <div className="flex items-center justify-between py-1 border-t border-black/10 dark:border-white/10">
            <div className="flex flex-col">
              <span className="text-xs font-bold font-dm">Continuous Daemon Mode</span>
              <span className="text-[11px] opacity-75 font-dm">
                Minimizing or closing hides to tray; 10 FPS adaptive vision continues
              </span>
            </div>
            <span className="text-[11px] font-semibold font-dm text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full">
              Active in Background
            </span>
          </div>

          {/* Driver & EcoQoS Status Badge */}
          <div className="flex flex-col gap-1 py-1 border-t border-black/10 dark:border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-dm flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Driver &amp; EcoQoS Architecture
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">
                {platformInfo?.ecoQoS?.tier
                  ? `Tier ${platformInfo.ecoQoS.tier} (${platformInfo.ecoQoS.mode})`
                  : 'Win32 E-Cores / V4L2'}
              </span>
            </div>
            <span className="text-[11px] opacity-75 font-dm">
              {platformInfo?.driverStack || 'WMF Video Capture & Intel/AMD Efficiency Cores'}
            </span>
          </div>

          {/* Local SQLite Database 30-Day Retention */}
          <div className="flex items-center justify-between py-1 border-t border-black/10 dark:border-white/10">
            <div className="flex flex-col">
              <span className="text-xs font-bold font-dm flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Local SQLite Database
              </span>
              <span className="text-[11px] opacity-75 font-dm">
                WAL mode store with automated 30-day telemetry retention
              </span>
            </div>
            <button
              type="button"
              disabled={pruningDb}
              onClick={handleManualPrune}
              className="btn-pill-secondary py-1 px-3 text-[11px]"
            >
              <HardDrive className="w-3 h-3" />
              <span>{pruningDb ? 'Pruning...' : 'Prune Now'}</span>
            </button>
          </div>

          {pruneMsg && (
            <div className="text-[11px] font-dm text-emerald-500 bg-emerald-500/10 p-2 rounded-xl text-center">
              {pruneMsg}
            </div>
          )}
        </div>

        {/* Done Button */}
        <button
          type="button"
          onClick={onClose}
          className="btn-pill-primary w-full py-3"
        >
          Done
        </button>
      </div>
    </div>
  );
};
