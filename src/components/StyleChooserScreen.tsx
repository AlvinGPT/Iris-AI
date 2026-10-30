import React, { useState } from 'react';
import { Check, Eye, Ruler, Activity, Sparkles, ArrowRight, Paintbrush, Sun, Moon } from 'lucide-react';
import { OrbitingEyeLogo } from './OrbitingEyeLogo';
import { StyleMode, useTheme } from '../context/ThemeContext';

interface StyleChooserScreenProps {
  userName?: string;
  onSelectStyle: (mode: StyleMode) => void;
}

export const StyleChooserScreen: React.FC<StyleChooserScreenProps> = ({
  userName = 'Hinta Suresh',
  onSelectStyle,
}) => {
  const { styleMode, setStyleMode, colorMode, setColorMode, isDark } = useTheme();
  const [hoveredMode, setHoveredMode] = useState<StyleMode | null>(null);

  const activePreview = hoveredMode || styleMode;

  const handleChoose = (mode: StyleMode) => {
    setStyleMode(mode);
    onSelectStyle(mode);
  };

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between p-6 sm:p-10 lg:p-12 transition-all duration-300 select-none ${
        activePreview === 'minimal'
          ? isDark
            ? 'minimal-dark-gradient-surface text-[#F5EDE4]'
            : 'minimal-gradient-surface text-[#0F172A]'
          : isDark
          ? 'bg-[#141414] text-[#F5F5F0]'
          : 'bg-[#FFF8ED] text-black'
      }`}
    >
      {/* Top Brand Header + Independent Light/Dark Toggle */}
      <header className="w-full max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <OrbitingEyeLogo size={40} className="w-10 h-10" />
          <div>
            <span
              className={`text-2xl tracking-tight font-bold leading-none block ${
                activePreview === 'minimal'
                  ? isDark
                    ? 'font-eb-garamond text-[#F5EDE4]'
                    : 'font-eb-garamond text-[#0F172A]'
                  : isDark
                  ? 'font-cormorant text-[#F5F5F0]'
                  : 'font-cormorant text-black'
              }`}
            >
              IRIS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Independent Light / Dark Mode Switcher */}
          <div
            className={`inline-flex items-center p-1 rounded-full font-dm text-xs ${
              activePreview === 'minimal'
                ? isDark
                  ? 'bg-white/[0.08] backdrop-blur-md border border-white/[0.14]'
                  : 'bg-white/80 backdrop-blur-md border border-white/90 shadow-xs'
                : isDark
                ? 'bg-[#1F1F1F] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                : 'bg-white border-2 border-black shadow-[2px_2px_0px_#000000]'
            }`}
          >
            <button
              type="button"
              onClick={() => setColorMode('light')}
              className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all cursor-pointer ${
                colorMode === 'light'
                  ? activePreview === 'minimal'
                    ? 'bg-[#111827] text-white font-semibold shadow-2xs'
                    : 'bg-[#FFD84D] text-black font-extrabold border border-black'
                  : 'opacity-70 hover:opacity-100 font-medium'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => setColorMode('dark')}
              className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all cursor-pointer ${
                colorMode === 'dark'
                  ? activePreview === 'minimal'
                    ? 'bg-[#FF7A1A] text-[#0D0D0D] font-semibold shadow-2xs'
                    : 'bg-[#D4FF3F] text-[#0D0D0D] font-extrabold border border-[#0D0D0D]'
                  : 'opacity-70 hover:opacity-100 font-medium'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </button>
          </div>

          <div
            className={`hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full font-dm text-xs ${
              activePreview === 'minimal'
                ? isDark
                  ? 'bg-white/[0.08] backdrop-blur-md border border-white/[0.14] text-[#F5EDE4] font-medium'
                  : 'bg-white/80 backdrop-blur-md border border-white/90 text-[#0F172A] shadow-sm font-medium'
                : isDark
                ? 'bg-[#1F1F1F] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] text-[#F5F5F0] font-bold'
                : 'bg-white border-2 border-black shadow-[2px_2px_0px_#000000] text-black font-bold'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            <span>Signed in as {userName}</span>
          </div>
        </div>
      </header>

      {/* Center Heading & Two Large Side-by-Side Desktop-First Preview Cards */}
      <main className="w-full max-w-6xl mx-auto my-auto py-8 flex flex-col items-center">
        <div className="text-center max-w-2xl mb-8 sm:mb-10">
          <span
            className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] font-dm mb-2 ${
              activePreview === 'minimal'
                ? isDark
                  ? 'text-[#FF7A1A] font-semibold'
                  : 'text-[#5B3CB5] font-semibold'
                : isDark
                ? 'text-[#D4FF3F] font-extrabold'
                : 'text-black font-extrabold'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Workspace Appearance Setup · {isDark ? 'Dark Mode' : 'Light Mode'}
          </span>
          <h1
            className={`text-4xl sm:text-5xl lg:text-[54px] leading-[1.08] tracking-tight ${
              activePreview === 'minimal'
                ? isDark
                  ? 'font-eb-garamond font-medium text-[#F5EDE4]'
                  : 'font-eb-garamond font-medium text-[#0F172A]'
                : isDark
                ? 'font-cormorant font-bold text-[#F5F5F0]'
                : 'font-cormorant font-bold text-black'
            }`}
          >
            Choose your style
          </h1>
          <p
            className={`font-dm text-sm sm:text-base mt-2.5 leading-relaxed ${
              activePreview === 'minimal'
                ? isDark
                  ? 'text-[#B8AAA0] font-normal'
                  : 'text-[#475569] font-normal'
                : isDark
                ? 'text-[#D4D4CE] font-semibold'
                : 'text-black/80 font-semibold'
            }`}
          >
            Select Minimal or Vivid independently of Light or Dark mode. Toggle Light/Dark above to preview all four theme combinations.
          </p>
        </div>

        {/* Two Large Side-by-Side Preview Cards */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-7 lg:gap-9 items-stretch">
          {/* ============================================================
              CARD 1: MINIMAL (LIGHT OR DARK)
              ============================================================ */}
          <div
            onMouseEnter={() => setHoveredMode('minimal')}
            onMouseLeave={() => setHoveredMode(null)}
            onClick={() => handleChoose('minimal')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleChoose('minimal');
              }
            }}
            className={`group relative rounded-[32px] p-7 sm:p-8 flex flex-col justify-between text-left cursor-pointer transition-all duration-300 overflow-hidden ${
              styleMode === 'minimal'
                ? isDark
                  ? 'ring-2 ring-[#FF7A1A] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)] -translate-y-1'
                  : 'ring-2 ring-[#7B5CD6] shadow-[0_24px_60px_-12px_rgba(15,23,42,0.16)] -translate-y-1'
                : 'hover:-translate-y-1 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.14)]'
            }`}
            style={
              isDark
                ? {
                    backgroundImage:
                      'radial-gradient(95% 65% at 85% 95%, rgba(184, 90, 30, 0.25) 0%, rgba(184, 90, 30, 0) 70%), linear-gradient(168deg, #14100D 0%, #1E140E 48%, #2A1B12 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                  }
                : {
                    backgroundImage:
                      'linear-gradient(168deg, #BFD8FA 0%, #DCE3FA 48%, #F8FAFE 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.90)',
                  }
            }
          >
            {/* Card Header */}
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <span
                    className={`font-dm text-[11px] uppercase tracking-[0.18em] font-semibold block mb-1 ${
                      isDark ? 'text-[#FF7A1A]' : 'text-[#5B3CB5]'
                    }`}
                  >
                    Atmospheric Glass &middot; {isDark ? 'Warm Espresso & Amber' : 'Sky-Blue & Lavender'}
                  </span>
                  <h2
                    className={`text-3xl sm:text-4xl font-medium tracking-tight leading-tight ${
                      isDark ? 'text-[#F5EDE4]' : 'text-[#0F172A]'
                    }`}
                    style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
                  >
                    Minimal {isDark ? 'Dark' : 'Light'}
                  </h2>
                </div>
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    styleMode === 'minimal'
                      ? isDark
                        ? 'bg-[#FF7A1A] text-[#0D0D0D] shadow-sm'
                        : 'bg-[#111827] text-white shadow-sm'
                      : isDark
                      ? 'bg-white/[0.10] text-[#F5EDE4] border border-white/[0.16]'
                      : 'bg-white/85 text-[#0F172A] border border-white/90 shadow-sm'
                  }`}
                >
                  <Check className="w-4 h-4" />
                </div>
              </div>

              {/* Miniature Live Dashboard Preview — Minimal Aesthetic */}
              <div
                className={`rounded-[24px] p-5 backdrop-blur-md flex flex-col gap-4 mb-6 ${
                  isDark
                    ? 'bg-white/[0.06] border border-white/[0.12] shadow-[0_14px_36px_-8px_rgba(0,0,0,0.55)]'
                    : 'bg-white/55 border border-white/85 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)]'
                }`}
              >
                {/* Mini Top Nav Pill */}
                <div
                  className={`flex items-center justify-between px-4 py-2.5 rounded-full backdrop-blur-md ${
                    isDark
                      ? 'bg-white/[0.08] border border-white/[0.14]'
                      : 'bg-white/85 border border-white/90 shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-[#FF7A1A]' : 'bg-[#7B5CD6]'}`} />
                    <span
                      className={`text-sm font-medium ${isDark ? 'text-[#F5EDE4]' : 'text-[#0F172A]'}`}
                      style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
                    >
                      Good Morning, {userName.split(' ')[0]}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-dm font-semibold ${
                      isDark
                        ? 'bg-[#FF7A1A] text-[#0D0D0D]'
                        : 'bg-[#111827] text-white shadow-2xs'
                    }`}
                  >
                    Overview
                  </span>
                </div>

                {/* Mini Glass Metric Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div
                    className={`p-4 rounded-2xl backdrop-blur-md flex flex-col justify-between gap-3 ${
                      isDark
                        ? 'bg-white/[0.08] border border-white/[0.12]'
                        : 'border border-white/60 shadow-[0_8px_24px_-6px_rgba(91,60,181,0.22)] text-white'
                    }`}
                    style={
                      !isDark
                        ? {
                            background: 'linear-gradient(135deg, #5B3CB5 0%, #6E4FC9 55%, #7F61DA 100%)',
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-dm text-[10px] uppercase tracking-wider font-semibold ${
                          isDark ? 'text-[#B8AAA0]' : 'text-white/90'
                        }`}
                      >
                        Avg. Blink Rate
                      </span>
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                          isDark
                            ? 'bg-white/[0.10] border border-white/[0.14] text-[#FF7A1A]'
                            : 'bg-white/20 border border-white/35 text-white'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`font-dm text-2xl font-semibold tabular-nums ${
                            isDark ? 'text-[#F5EDE4]' : 'text-white'
                          }`}
                        >
                          16
                        </span>
                        <span className={`font-dm text-xs ${isDark ? 'text-[#B8AAA0]' : 'text-white/85'}`}>BPM</span>
                      </div>
                      <span
                        className={`font-dm text-[10px] font-medium block mt-1 ${
                          isDark ? 'text-[#FF7A1A]' : 'text-white/90'
                        }`}
                      >
                        Live
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-2xl backdrop-blur-md flex flex-col justify-between gap-3 ${
                      isDark
                        ? 'bg-white/[0.08] border border-white/[0.12]'
                        : 'border border-white/75 shadow-[0_8px_24px_-6px_rgba(59,130,246,0.15)] text-[#0F172A]'
                    }`}
                    style={
                      !isDark
                        ? {
                            background: 'linear-gradient(135deg, #8FB4F2 0%, #BCD3FA 100%)',
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-dm text-[10px] uppercase tracking-wider font-semibold ${
                          isDark ? 'text-[#B8AAA0]' : 'text-[#1E293B]'
                        }`}
                      >
                        Screen Distance
                      </span>
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                          isDark
                            ? 'bg-white/[0.10] border border-white/[0.14] text-[#FF7A1A]'
                            : 'bg-white/65 border border-white/80 text-[#0F172A]'
                        }`}
                      >
                        <Ruler className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`font-dm text-2xl font-semibold tabular-nums ${
                            isDark ? 'text-[#F5EDE4]' : 'text-[#0F172A]'
                          }`}
                        >
                          52
                        </span>
                        <span className={`font-dm text-xs ${isDark ? 'text-[#B8AAA0]' : 'text-[#1E293B]'}`}>cm</span>
                      </div>
                      <span
                        className={`font-dm text-[10px] font-medium block mt-1 ${
                          isDark ? 'text-[#FF7A1A]' : 'text-[#1E293B]'
                        }`}
                      >
                        Calibrated
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mini Translucent Footer Bar */}
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl backdrop-blur-md ${
                    isDark
                      ? 'bg-white/[0.08] border border-white/[0.12]'
                      : 'bg-white/80 border border-white/90'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Activity className={`w-4 h-4 ${isDark ? 'text-[#FF7A1A]' : 'text-[#7B5CD6]'}`} />
                    <span
                      className={`font-dm text-xs font-medium ${
                        isDark ? 'text-[#F5EDE4]' : 'text-[#0F172A]'
                      }`}
                    >
                      2-Minute Break Coach
                    </span>
                  </div>
                  <span
                    className={`px-3.5 py-1.5 rounded-full font-dm text-[11px] font-semibold ${
                      isDark
                        ? 'bg-[#FF7A1A] text-[#0D0D0D] shadow-xs'
                        : 'bg-[#7B5CD6] text-white shadow-xs'
                    }`}
                  >
                    Start Break
                  </span>
                </div>
              </div>
            </div>

            {/* Description & Pill CTA */}
            <div className="flex flex-col gap-4">
              <p
                className={`font-dm text-xs sm:text-[13px] leading-relaxed ${
                  isDark ? 'text-[#B8AAA0]' : 'text-[#475569]'
                }`}
              >
                {isDark
                  ? 'EB Garamond headings, DM Sans UI text, warm espresso-to-amber dark canvas, dark frosted glass surfaces with fine light borders, and vibrant orange accents.'
                  : 'EB Garamond headings, DM Sans UI text, soft sky-blue to pale-lavender canvas, frosted white surfaces, violet and soft-blue tinted metric cards, and near-black active pills.'}
              </p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleChoose('minimal');
                }}
                className={`w-full py-3.5 px-6 rounded-full font-dm text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer group-hover:translate-y-[-1px] ${
                  isDark
                    ? 'bg-[#FF7A1A] hover:brightness-105 text-[#0D0D0D] border border-white/25 shadow-[0_8px_24px_-4px_rgba(255,122,26,0.3)]'
                    : 'bg-[#111827] hover:bg-[#1E293B] text-white border border-[#111827] shadow-[0_8px_22px_-4px_rgba(15,23,42,0.18)]'
                }`}
              >
                <span>Continue with Minimal ({isDark ? 'Dark' : 'Light'})</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>

          {/* ============================================================
              CARD 2: VIVID (LIGHT OR DARK)
              ============================================================ */}
          <div
            onMouseEnter={() => setHoveredMode('vivid')}
            onMouseLeave={() => setHoveredMode(null)}
            onClick={() => handleChoose('vivid')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleChoose('vivid');
              }
            }}
            className={`group relative rounded-[32px] p-7 sm:p-8 flex flex-col justify-between text-left cursor-pointer transition-all duration-300 overflow-hidden ${
              isDark
                ? `bg-[#141414] text-[#F5F5F0] border-2 border-[#F5F5F0] ${
                    styleMode === 'vivid'
                      ? 'shadow-[8px_8px_0px_#D4FF3F] -translate-y-1'
                      : 'shadow-[5px_5px_0px_#F5F5F0] hover:shadow-[8px_8px_0px_#D4FF3F] hover:-translate-y-1'
                  }`
                : `bg-[#FFF8ED] text-black border-2 border-black ${
                    styleMode === 'vivid'
                      ? 'shadow-[8px_8px_0px_#000000] -translate-y-1'
                      : 'shadow-[5px_5px_0px_#000000] hover:shadow-[8px_8px_0px_#000000] hover:-translate-y-1'
                  }`
            }`}
          >
            {/* Card Header */}
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <span
                    className={`font-dm text-[11px] uppercase tracking-[0.18em] font-extrabold block mb-1 ${
                      isDark ? 'text-[#D4FF3F]' : 'text-black'
                    }`}
                  >
                    {isDark ? 'Near-Black & Saturated Color-Block' : 'Tactile Color-Block · High Energy'}
                  </span>
                  <h2
                    className={`text-3xl sm:text-4xl font-bold tracking-tight leading-tight ${
                      isDark ? 'text-[#F5F5F0]' : 'text-black'
                    }`}
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                  >
                    Vivid {isDark ? 'Dark' : 'Light'}
                  </h2>
                </div>
                <div
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${
                    isDark
                      ? `border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] ${
                          styleMode === 'vivid' ? 'bg-[#D4FF3F] text-[#0D0D0D]' : 'bg-[#262626] text-[#F5F5F0]'
                        }`
                      : `border-black shadow-[2px_2px_0px_#000000] ${
                          styleMode === 'vivid' ? 'bg-[#FFD84D] text-black' : 'bg-white text-black'
                        }`
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>

              {/* Miniature Live Dashboard Preview — Vivid Aesthetic */}
              <div
                className={`rounded-[24px] p-5 border-2 flex flex-col gap-4 mb-6 ${
                  isDark
                    ? 'bg-[#1F1F1F] border-[#F5F5F0] shadow-[4px_4px_0px_#F5F5F0]'
                    : 'bg-white border-black shadow-[4px_4px_0px_#000000]'
                }`}
              >
                {/* Mini Top Nav Pill */}
                <div
                  className={`flex items-center justify-between px-4 py-2.5 rounded-full border-2 ${
                    isDark
                      ? 'bg-[#262626] border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                      : 'bg-[#FFF8ED] border-black shadow-[2px_2px_0px_#000000]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full border ${
                        isDark ? 'bg-[#D4FF3F] border-[#0D0D0D]' : 'bg-[#FF851B] border-black'
                      }`}
                    />
                    <span
                      className={`text-sm font-bold ${isDark ? 'text-[#F5F5F0]' : 'text-black'}`}
                      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                    >
                      Good Morning, {userName.split(' ')[0]}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-0.5 rounded-full text-[11px] font-dm font-extrabold border-2 ${
                      isDark
                        ? 'bg-[#D4FF3F] text-[#0D0D0D] border-[#0D0D0D]'
                        : 'bg-[#FFD84D] text-black border-black'
                    }`}
                  >
                    Live Stats
                  </span>
                </div>

                {/* Mini Opaque Metric Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div
                    className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-3 ${
                      isDark
                        ? 'bg-[#B968F0] border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] text-[#0D0D0D]'
                        : 'bg-[#C77DFF] border-black shadow-[3px_3px_0px_#000000] text-black'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-dm text-[10px] uppercase tracking-wider font-extrabold text-[#0D0D0D]">
                        Avg. Blink Rate
                      </span>
                      <div
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${
                          isDark
                            ? 'bg-[#F7F5EE] border-[#0D0D0D] text-[#0D0D0D]'
                            : 'bg-white border-black text-black'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-dm text-2xl font-extrabold tabular-nums text-[#0D0D0D]">
                          16
                        </span>
                        <span className="font-dm text-xs font-extrabold text-[#0D0D0D]/80">
                          /min
                        </span>
                      </div>
                      <span className="font-dm text-[10px] font-bold block mt-1 text-[#0D0D0D]">
                        Within target
                      </span>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-2xl border-2 flex flex-col justify-between gap-3 ${
                      isDark
                        ? 'bg-[#25D6C1] border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] text-[#0D0D0D]'
                        : 'bg-[#25D6C1] border-black shadow-[3px_3px_0px_#000000] text-black'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-dm text-[10px] uppercase tracking-wider font-extrabold text-[#0D0D0D]">
                        Screen Distance
                      </span>
                      <div
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${
                          isDark
                            ? 'bg-[#F7F5EE] border-[#0D0D0D] text-[#0D0D0D]'
                            : 'bg-white border-black text-black'
                        }`}
                      >
                        <Ruler className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-dm text-2xl font-extrabold tabular-nums text-[#0D0D0D]">
                          52
                        </span>
                        <span className="font-dm text-xs font-extrabold text-[#0D0D0D]/80">
                          cm
                        </span>
                      </div>
                      <span className="font-dm text-[10px] font-bold block mt-1 text-[#0D0D0D]">
                        Within target
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mini Opaque Footer Bar */}
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl border-2 ${
                    isDark
                      ? 'bg-[#FF8A1F] border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] text-[#0D0D0D]'
                      : 'bg-[#FF851B] border-black shadow-[3px_3px_0px_#000000] text-black'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#0D0D0D]" />
                    <span className="font-dm text-xs font-extrabold text-[#0D0D0D]">
                      2-Minute Break Coach
                    </span>
                  </div>
                  <span
                    className={`px-3.5 py-1 rounded-full font-dm text-[11px] font-extrabold border-2 ${
                      isDark
                        ? 'bg-[#D4FF3F] text-[#0D0D0D] border-[#0D0D0D]'
                        : 'bg-black text-white border-black'
                    }`}
                  >
                    Start Break
                  </span>
                </div>
              </div>
            </div>

            {/* Description & Vivid Pill CTA */}
            <div className="flex flex-col gap-4">
              <p
                className={`font-dm text-xs sm:text-[13px] font-semibold leading-relaxed ${
                  isDark ? 'text-[#D4D4CE]' : 'text-black/85'
                }`}
              >
                {isDark
                  ? 'Near-black neutral canvas (#141414) with saturated solid-color cards in Violet, Teal, Orange, Lime, and Sky Blue, 2px off-white outlines, tactile offset shadows, and bold dark ink on vibrant surfaces.'
                  : 'Warm cream canvas (#FFF8ED) with vibrant opaque cards in orange, teal, purple, yellow, and sky blue, bold 2px black outlines, and tactile hard-offset shadows.'}
              </p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleChoose('vivid');
                }}
                className={`w-full py-3.5 px-6 rounded-full font-dm text-sm font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer border-2 ${
                  isDark
                    ? 'bg-[#D4FF3F] hover:bg-[#FF8A1F] text-[#0D0D0D] border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0]'
                    : 'bg-black hover:bg-[#FF851B] text-white hover:text-black border-black shadow-[3px_3px_0px_#000000]'
                }`}
              >
                <span>Continue with Vivid ({isDark ? 'Dark' : 'Light'})</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Subtle Footer Note */}
      <footer className="w-full max-w-6xl mx-auto text-center pt-2">
        <p className="font-dm text-xs opacity-70">
          Your style and color mode preferences are saved automatically and can be changed anytime in the header.
        </p>
      </footer>
    </div>
  );
};
