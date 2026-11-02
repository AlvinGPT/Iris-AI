import React from 'react';
import { LayoutGrid, Sparkles, Eye, Calendar, PanelLeftClose } from 'lucide-react';
import { ActiveTab } from '../types';
import { OrbitingEyeLogo } from './OrbitingEyeLogo';
import { useTheme } from '../context/ThemeContext';
import { OcureDailyPlanService, OCURE_CONFIG } from '../services/ocureService';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  nextBreakSeconds?: number;
  onOpenPreferences: () => void;
  onOpenBreakModal: () => void;
  onOpenCalibration?: () => void;
  onOpenOnboarding?: () => void;
  onOpenDocs?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  nextBreakSeconds,
  onOpenPreferences,
  onOpenBreakModal,
  onOpenCalibration,
  onOpenOnboarding,
  onOpenDocs,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const { isMinimal, isDark } = useTheme();
  const completedBreaksToday = OcureDailyPlanService.getCompletedBreaksTodayCount();
  const maxDailyBreaks = OCURE_CONFIG.MAX_DAILY_BREAKS;

  const navItems: {
    id: ActiveTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    activeBgLight: string;
    activeBgDark: string;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', Icon: LayoutGrid, activeBgLight: 'bg-[#FF851B]', activeBgDark: 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)]' },
    { id: 'ocure', label: 'Ocure Coach', Icon: Sparkles, activeBgLight: 'bg-[#25D6C1]', activeBgDark: 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)]' },
    { id: 'retis', label: 'Retis Analyst', Icon: Eye, activeBgLight: 'bg-[#C77DFF]', activeBgDark: 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)]' },
    { id: 'logs', label: 'Session Logs', Icon: Calendar, activeBgLight: 'bg-[#FFD84D]', activeBgDark: 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)]' },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-full w-72 z-40 p-3 transition-transform duration-300 ease-in-out ${
        isCollapsed ? '-translate-x-full' : 'translate-x-0'
      }`}
    >
      <div className="h-full w-full tactile-card-white flex flex-col justify-between py-6 px-4">
        <div className="flex flex-col gap-5">
          {/* Logo Section & Collapse Button */}
          <div className="flex items-center justify-between px-2">
            <div
              onClick={() => onSelectTab('dashboard')}
              className="flex items-center gap-3 cursor-pointer transition-opacity hover:opacity-90 group"
            >
              <OrbitingEyeLogo size={36} className="w-9 h-9 transform scale-110 group-hover:scale-115 transition-transform" />
              <div className="flex flex-col">
                <span className="font-cormorant text-2xl tracking-tight font-bold leading-none">
                  IRIS
                </span>
              </div>
            </div>

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className={
                  isMinimal
                    ? isDark
                      ? 'w-8 h-8 rounded-full bg-[rgba(255,245,235,0.09)] hover:bg-[rgba(255,245,235,0.15)] text-[#F5EDE4] flex items-center justify-center transition-all cursor-pointer border border-white/14 shrink-0'
                      : 'w-8 h-8 rounded-full bg-white/85 hover:bg-white text-[#0F172A] flex items-center justify-center transition-all cursor-pointer border border-slate-300/60 shadow-xs shrink-0'
                    : isDark
                    ? 'w-8 h-8 rounded-full bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#F5F5F0] hover:text-[var(--vivid-accent-fg,#0D0D0D)] flex items-center justify-center transition-all cursor-pointer border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] shrink-0'
                    : 'w-8 h-8 rounded-full bg-[#FFF8ED] hover:bg-[#FFD84D] text-black flex items-center justify-center transition-all cursor-pointer border-2 border-black shadow-[2px_2px_0px_#000000] shrink-0'
                }
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Navigation Items (Pill Controls) */}
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const ItemIcon = item.Icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`group flex items-center gap-3 px-4 py-2.5 rounded-full transition-all duration-150 ease-out text-left font-dm cursor-pointer ${
                    isMinimal
                      ? isDark
                        ? isActive
                          ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] font-semibold border border-white/25 shadow-[0_6px_18px_-4px_rgba(255,122,26,0.28)] -translate-y-[1px]'
                          : 'text-[#B8AAA0] bg-transparent hover:bg-[rgba(255,245,235,0.09)] hover:text-[#F5EDE4] font-medium border border-transparent hover:border-white/14'
                        : isActive
                        ? 'bg-[#111827] text-white font-semibold border border-[#111827] shadow-[0_6px_16px_-4px_rgba(15,23,42,0.22)] -translate-y-[1px]'
                        : 'text-[#475569] bg-transparent hover:bg-white/70 hover:text-[#0F172A] font-medium border border-transparent hover:border-white/85'
                      : isDark
                      ? isActive
                        ? `${item.activeBgDark} font-extrabold border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] -translate-y-[1px]`
                        : 'text-[#F5F5F0] bg-transparent hover:bg-[#262626] font-bold border-2 border-transparent hover:border-[#F5F5F0]'
                      : isActive
                      ? `${item.activeBgLight} text-black font-extrabold border-2 border-black shadow-[3px_3px_0px_#000000] -translate-y-[1px]`
                      : 'text-black bg-transparent hover:bg-[#FFF8ED] font-bold border-2 border-transparent hover:border-black'
                  }`}
                >
                  <ItemIcon
                    className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
                      isMinimal
                        ? isDark
                          ? isActive
                            ? 'text-[var(--theme-accent-fg,#0D0D0D)]'
                            : 'text-[var(--theme-accent,#FF7A1A)] group-hover:scale-105'
                          : isActive
                          ? 'text-white'
                          : 'text-[#475569] group-hover:scale-105'
                        : isDark
                        ? isActive
                          ? 'text-current'
                          : 'text-[var(--vivid-accent,#D4FF3F)] group-hover:scale-105'
                        : 'text-black group-hover:scale-105'
                    }`}
                  />
                  <span className="text-[14px]">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Status & Settings */}
        <div className="flex flex-col gap-2.5 px-1">
          {/* Daily Break Plan Progress Card */}
          <div
            onClick={onOpenBreakModal}
            className={
              isMinimal
                ? isDark
                  ? 'p-4 rounded-2xl bg-[rgba(20,15,11,0.58)] border border-white/12 shadow-[0_8px_22px_-6px_rgba(0,0,0,0.5)] transition-all duration-150 hover:-translate-y-0.5 cursor-pointer flex flex-col gap-2 group'
                  : 'p-4 rounded-2xl bg-white/75 border border-white/90 shadow-[0_8px_22px_-6px_rgba(30,41,59,0.08)] transition-all duration-150 hover:-translate-y-0.5 cursor-pointer flex flex-col gap-2 group'
                : isDark
                ? 'p-4 rounded-2xl bg-[#D4FF3F] text-[#0D0D0D] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] transition-all duration-150 hover:-translate-y-0.5 cursor-pointer flex flex-col gap-2 group active:translate-y-0.5'
                : 'p-4 rounded-2xl bg-[#FFD84D] border-2 border-black shadow-[3px_3px_0px_#000000] transition-all duration-150 hover:-translate-y-0.5 cursor-pointer flex flex-col gap-2 group active:translate-y-0.5'
            }
            title="Start break"
          >
            <div className="flex items-center justify-between">
              <span className="font-dm text-[11px] uppercase tracking-wider font-bold">
                Today&apos;s Breaks
              </span>
              <span
                className={`font-dm text-xs font-bold group-hover:underline tabular-nums ${
                  isMinimal
                    ? isDark
                      ? 'text-[var(--theme-accent,#FF7A1A)]'
                      : 'text-[#5B3CB5]'
                    : isDark
                    ? 'text-[#0D0D0D]'
                    : 'text-black'
                }`}
              >
                {completedBreaksToday} of {maxDailyBreaks}
              </span>
            </div>
            <div
              className={
                isMinimal
                  ? isDark
                    ? 'w-full h-2 bg-white/10 rounded-full overflow-hidden'
                    : 'w-full h-2 bg-slate-900/10 rounded-full overflow-hidden'
                  : isDark
                  ? 'w-full h-2.5 bg-[#F7F5EE] rounded-full overflow-hidden border-2 border-[#0D0D0D]'
                  : 'w-full h-2.5 bg-white rounded-full overflow-hidden border-2 border-black'
              }
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isMinimal
                    ? isDark
                      ? 'bg-[var(--theme-accent,#FF7A1A)]'
                      : 'bg-[var(--theme-accent,#7B5CD6)]'
                    : 'bg-[#FF851B]'
                }`}
                style={{ width: `${Math.min(100, Math.round((completedBreaksToday / maxDailyBreaks) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
