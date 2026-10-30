import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Globe,
  Bell,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Paintbrush,
  Check,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { ActiveTab, EyeBreakLog } from '../types';
import { User } from '../lib/firebase';
import { OrbitingEyeLogo } from './OrbitingEyeLogo';
import { useTheme, COLOR_STUDIO_PRESETS } from '../context/ThemeContext';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onReturnToArchive?: () => void;
  currentUser?: User | null;
  onSignOut?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleCollapse?: () => void;
  userName?: string;
  logs?: EyeBreakLog[];
  onOpenOnboarding?: () => void;
  onOpenDocs?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  searchQuery,
  setSearchQuery,
  onReturnToArchive,
  currentUser,
  onSignOut,
  isSidebarCollapsed = false,
  onToggleCollapse,
  userName = 'Hinta Suresh',
  logs = [],
  onOpenOnboarding,
  onOpenDocs,
}) => {
  const {
    styleMode,
    setStyleMode,
    colorMode,
    setColorMode,
    toggleColorMode,
    accentColor,
    setAccentColor,
    isMinimal,
    isDark,
    setIsStyleChooserOpen,
  } = useTheme();

  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // Measure real top-navigation height and expose it as --iris-top-nav-height CSS custom property
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof document === 'undefined') return;
    const updateNavHeight = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) {
        document.documentElement.style.setProperty('--iris-top-nav-height', `${h}px`);
      }
    };
    updateNavHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateNavHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  // Close menus on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowStyleMenu(false);
        setShowUserMenu(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Notifications dynamically populated from actual verified logs
  const notifications = [
    ...logs.slice(0, 4).map((l) => {
      const isAlert =
        l.type.includes('Alert') || l.type.includes('Lock-in') || l.type.includes('Proximity') || l.status === 'Warning';
      return {
        id: l.id,
        title: l.type,
        time: l.time,
        Icon: isAlert ? AlertTriangle : CheckCircle2,
        badgeBg: isMinimal
          ? isDark
            ? isAlert
              ? 'bg-[#FF7A1A]/20 text-[#FF7A1A] border border-[#FF7A1A]/40'
              : 'bg-[var(--theme-accent,#FF7A1A)]/20 text-[var(--theme-accent,#FF7A1A)] border border-[var(--theme-accent,#FF7A1A)]/40'
            : isAlert
            ? 'bg-amber-50 text-amber-800 border border-amber-200/80'
            : 'bg-indigo-50 text-[#5B3CB5] border border-indigo-200/80'
          : isDark
          ? isAlert
            ? 'bg-[#FF8A1F] text-[#0D0D0D] border-2 border-[#F5F5F0]'
            : 'bg-[#25D6C1] text-[#0D0D0D] border-2 border-[#F5F5F0]'
          : isAlert
          ? 'bg-[#FF851B] text-black border-2 border-black'
          : 'bg-[#25D6C1] text-black border-2 border-black',
      };
    }),
  ];

  const tabs: { id: ActiveTab; label: string; activeColorLight: string; activeColorDark: string }[] = [
    { id: 'dashboard', label: 'Overview', activeColorLight: 'bg-[#FF851B] text-black', activeColorDark: 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)]' },
    { id: 'ocure', label: 'Ocure', activeColorLight: 'bg-[#25D6C1] text-black', activeColorDark: 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)]' },
    { id: 'retis', label: 'Retis AI', activeColorLight: 'bg-[#C77DFF] text-black', activeColorDark: 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)]' },
    { id: 'logs', label: 'Telemetry Records', activeColorLight: 'bg-[#FFD84D] text-black', activeColorDark: 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)]' },
  ];

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 right-0 h-20 z-30 transition-all duration-300 ease-in-out px-4 sm:px-6 lg:px-8 pt-3 ${
        isSidebarCollapsed ? 'left-0' : 'left-0 lg:left-72'
      }`}
    >
      <div className="h-16 w-full px-4 lg:px-6 rounded-full glass-nav-pill flex items-center justify-between gap-4">
        {/* Region 1: Sidebar Expand, Brand Logo & Search Pill (Left) */}
        <div className="flex items-center gap-2.5 flex-1 max-w-xs xl:max-w-sm min-w-0">
          {onToggleCollapse && isSidebarCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={
                isMinimal
                  ? isDark
                    ? 'w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[#F5EDE4] border border-white/[0.14] flex items-center justify-center transition-all cursor-pointer shrink-0'
                    : 'w-9 h-9 rounded-full bg-white/85 hover:bg-white text-[#0F172A] border border-slate-200/80 shadow-xs flex items-center justify-center transition-all cursor-pointer shrink-0'
                  : isDark
                  ? 'w-9 h-9 rounded-full bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#F5F5F0] hover:text-[var(--vivid-accent-fg,#0D0D0D)] flex items-center justify-center transition-all cursor-pointer border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] shrink-0'
                  : 'w-9 h-9 rounded-full bg-[#FFD84D] hover:bg-[#FF851B] text-black flex items-center justify-center transition-all cursor-pointer border-2 border-black shadow-[2px_2px_0px_#000000] shrink-0'
              }
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          {/* Brand Emblem Logo when sidebar is collapsed or on mobile */}
          <div
            onClick={() => onSelectTab('dashboard')}
            className={`flex items-center gap-2 cursor-pointer shrink-0 ${
              isSidebarCollapsed ? 'flex' : 'flex lg:hidden'
            }`}
            title="IRIS"
          >
            <OrbitingEyeLogo size={36} className="w-9 h-9" />
          </div>

          <div
            className={
              isMinimal
                ? isDark
                  ? 'flex items-center gap-2.5 w-full bg-white/[0.06] hover:bg-white/[0.10] focus-within:bg-white/[0.12] transition-all duration-150 ease-out px-4 py-2 rounded-full border border-white/[0.12] min-w-0'
                  : 'flex items-center gap-2.5 w-full bg-white/75 hover:bg-white/90 focus-within:bg-white transition-all duration-150 ease-out px-4 py-2 rounded-full border border-white/90 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] min-w-0'
                : isDark
                ? 'flex items-center gap-2.5 w-full bg-[#161616] transition-all duration-150 ease-out px-4 py-2 rounded-full border-2 border-[#F5F5F0] focus-within:border-[var(--vivid-accent,#D4FF3F)] min-w-0'
                : 'flex items-center gap-2.5 w-full bg-[#FFF8ED] transition-all duration-150 ease-out px-4 py-2 rounded-full border-2 border-black focus-within:bg-white min-w-0'
            }
          >
            <Search
              className={`w-4 h-4 shrink-0 ${
                isMinimal
                  ? isDark
                    ? 'text-[var(--theme-accent,#FF7A1A)]'
                    : 'text-[#475569]'
                  : isDark
                  ? 'text-[var(--vivid-accent,#D4FF3F)]'
                  : 'text-black'
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search breaks, notes, or logs..."
              className={`bg-transparent w-full min-w-0 focus:outline-none font-dm text-[13px] ${
                isMinimal
                  ? isDark
                    ? 'text-[#F5EDE4] placeholder:text-[#94867B] font-normal'
                    : 'text-[#0F172A] placeholder:text-[#64748B] font-normal'
                  : isDark
                  ? 'text-[#F5F5F0] placeholder:text-[#A3A39E] font-medium'
                  : 'text-black placeholder:text-black/60 font-medium'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-current shrink-0 p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Region 2: Floating Pill Navigation Links (Center) */}
        <nav
          className={
            isMinimal
              ? isDark
                ? 'hidden lg:flex items-center justify-center gap-1.5 p-1 rounded-full bg-white/[0.06] border border-white/[0.12] min-w-0 overflow-x-auto no-scrollbar font-dm'
                : 'hidden lg:flex items-center justify-center gap-1.5 p-1 rounded-full bg-white/65 border border-white/85 min-w-0 overflow-x-auto no-scrollbar font-dm'
              : isDark
              ? 'hidden lg:flex items-center justify-center gap-1.5 p-1 rounded-full bg-[#161616] border-2 border-[#F5F5F0] min-w-0 overflow-x-auto no-scrollbar font-dm'
              : 'hidden lg:flex items-center justify-center gap-1.5 p-1 rounded-full bg-[#FFF8ED] border-2 border-black min-w-0 overflow-x-auto no-scrollbar font-dm'
          }
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`px-4 py-1.5 rounded-full transition-all duration-150 ease-out whitespace-nowrap text-[13px] cursor-pointer ${
                  isMinimal
                    ? isDark
                      ? isActive
                        ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] font-semibold border border-white/25 shadow-[0_4px_14px_-2px_rgba(255,122,26,0.28)]'
                        : 'text-[#B8AAA0] hover:text-[#F5EDE4] hover:bg-white/[0.08] font-medium border border-transparent'
                      : isActive
                      ? 'bg-[#111827] text-white font-semibold border border-[#111827] shadow-[0_4px_12px_-2px_rgba(15,23,42,0.18)]'
                      : 'text-[#475569] hover:text-[#0F172A] hover:bg-white/65 font-medium border border-transparent'
                    : isDark
                    ? isActive
                      ? `${tab.activeColorDark} font-extrabold border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]`
                      : 'text-[#F5F5F0] hover:bg-[#262626] font-bold border-2 border-transparent'
                    : isActive
                    ? `${tab.activeColorLight} font-extrabold border-2 border-black shadow-[2px_2px_0px_#000000]`
                    : 'text-black hover:bg-black/10 font-bold border-2 border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Region 3: Independent Style Selector (Minimal | Vivid), Independent Light/Dark Toggle, Notifications & Profile */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {onReturnToArchive && (
            <button
              type="button"
              onClick={onReturnToArchive}
              className={
                isMinimal
                  ? isDark
                    ? 'hidden xl:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.14] text-[#F5EDE4] font-semibold transition-all cursor-pointer'
                    : 'hidden xl:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/85 hover:bg-white border border-slate-200/80 text-[#0F172A] font-semibold shadow-xs transition-all cursor-pointer'
                  : isDark
                  ? 'hidden xl:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] border-2 border-[#F5F5F0] text-[#F5F5F0] hover:text-[var(--vivid-accent-fg,#0D0D0D)] font-bold shadow-[2px_2px_0px_#F5F5F0] transition-all cursor-pointer'
                  : 'hidden xl:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#55C7F2] border-2 border-black text-black font-bold shadow-[2px_2px_0px_#000000] transition-all cursor-pointer'
              }
              title="Return home"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="font-dm text-xs">Home</span>
            </button>
          )}

          {/* Independent Light / Dark Mode Quick Toggle Button */}
          <button
            type="button"
            onClick={toggleColorMode}
            className={
              isMinimal
                ? isDark
                  ? 'h-9 px-3 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.14] text-[#F5EDE4] flex items-center gap-1.5 transition-all duration-150 cursor-pointer font-dm text-xs font-semibold shadow-[0_4px_14px_-3px_rgba(0,0,0,0.45)]'
                  : 'h-9 px-3 rounded-full bg-white/85 hover:bg-white border border-slate-200/80 shadow-[0_4px_14px_-3px_rgba(15,23,42,0.08)] flex items-center gap-1.5 text-[#0F172A] transition-all duration-150 cursor-pointer font-dm text-xs font-semibold'
                : isDark
                ? 'h-9 px-3 rounded-full bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] flex items-center gap-1.5 text-[#F5F5F0] hover:text-[var(--vivid-accent-fg,#0D0D0D)] transition-all duration-150 cursor-pointer font-dm text-xs font-extrabold'
                : 'h-9 px-3 rounded-full bg-white hover:bg-[#FFD84D] border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center gap-1.5 text-black transition-all duration-150 cursor-pointer font-dm text-xs font-extrabold'
            }
            title={`Switch to ${isDark ? 'Light' : 'Dark'} mode (Current: ${styleMode} ${colorMode})`}
            aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
          >
            {isDark ? (
              <Moon className={`w-3.5 h-3.5 shrink-0 ${isMinimal ? 'text-[var(--theme-accent,#FF7A1A)]' : 'text-[var(--vivid-accent,#D4FF3F)]'}`} />
            ) : (
              <Sun className={`w-3.5 h-3.5 shrink-0 ${isMinimal ? 'text-[var(--theme-accent,#7B5CD6)]' : 'text-[#FF851B]'}`} />
            )}
            <span className="hidden md:inline capitalize">{colorMode}</span>
          </button>

          {/* Paintbrush Icon Dropdown: Independent Minimal/Vivid & Light/Dark Controls */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowStyleMenu(!showStyleMenu);
                setShowNotifications(false);
                setShowUserMenu(false);
              }}
              className={
                isMinimal
                  ? isDark
                    ? 'relative h-9 px-3 rounded-full bg-[var(--theme-accent,#FF7A1A)] hover:brightness-105 border border-white/20 shadow-[0_4px_14px_-3px_rgba(255,122,26,0.3)] flex items-center gap-2 text-[var(--theme-accent-fg,#0D0D0D)] transition-all duration-150 cursor-pointer font-dm text-xs font-semibold'
                    : 'relative h-9 px-3 rounded-full bg-white/85 hover:bg-white border border-slate-200/80 shadow-[0_4px_14px_-3px_rgba(15,23,42,0.08)] flex items-center gap-2 text-[#0F172A] transition-all duration-150 cursor-pointer font-dm text-xs font-semibold'
                  : isDark
                  ? 'relative h-9 px-3 rounded-full bg-[var(--vivid-accent,#D4FF3F)] hover:bg-[var(--vivid-accent-hover,#FF8A1F)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] flex items-center gap-2 text-[var(--vivid-accent-fg,#0D0D0D)] transition-all duration-150 cursor-pointer font-dm text-xs font-extrabold'
                  : 'relative h-9 px-3 rounded-full bg-[#FFD84D] hover:bg-[#FF851B] border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center gap-2 text-black transition-all duration-150 cursor-pointer font-dm text-xs font-extrabold'
              }
              title="Choose interface style (Minimal or Vivid) and color mode (Light or Dark)"
              aria-label="Choose interface style (Minimal or Vivid)"
              aria-expanded={showStyleMenu}
            >
              <Paintbrush className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline capitalize">{styleMode}</span>
            </button>

            {showStyleMenu && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setShowStyleMenu(false)}
                />
                <div className="absolute right-0 mt-3 w-80 glass-modal p-4 z-50 animate-dropdown-enter">
                  <div
                    className={`flex items-center justify-between pb-2.5 px-1 ${
                      isMinimal
                        ? isDark
                          ? 'border-b border-white/[0.12]'
                          : 'border-b border-slate-200/80'
                        : isDark
                        ? 'border-b-2 border-[#F5F5F0]'
                        : 'border-b-2 border-black'
                    }`}
                  >
                    <span className="font-dm text-xs font-bold uppercase tracking-wider">
                      Style &amp; Appearance
                    </span>
                    <span
                      className={
                        isMinimal
                          ? isDark
                            ? 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white/[0.08] border border-white/[0.16] text-[var(--theme-accent,#FF7A1A)] capitalize'
                            : 'text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#111827] border border-[#111827] text-white capitalize'
                          : isDark
                          ? 'text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)] border border-[#F5F5F0] capitalize'
                          : 'text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#FFD84D] text-black border border-black capitalize'
                      }
                    >
                      {styleMode} · {colorMode}
                    </span>
                  </div>

                  {/* Independent Light / Dark Mode Switcher */}
                  <div className="mt-3 mb-3">
                    <span className="font-dm text-[10px] uppercase tracking-wider font-bold opacity-75 block mb-1.5 px-1">
                      Mode
                    </span>
                    <div
                      className={
                        isMinimal
                          ? isDark
                            ? 'grid grid-cols-2 gap-1.5 p-1 rounded-full bg-white/[0.06] border border-white/[0.12]'
                            : 'grid grid-cols-2 gap-1.5 p-1 rounded-full bg-slate-100/90 border border-slate-200/80'
                          : isDark
                          ? 'grid grid-cols-2 gap-1.5 p-1 rounded-full bg-[#161616] border-2 border-[#F5F5F0]'
                          : 'grid grid-cols-2 gap-1.5 p-1 rounded-full bg-[#FFF8ED] border-2 border-black'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setColorMode('light')}
                        className={`py-1.5 px-3 rounded-full font-dm text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          colorMode === 'light'
                            ? isMinimal
                              ? 'bg-[#111827] text-white font-semibold shadow-xs'
                              : 'bg-[#FFD84D] text-black font-extrabold border-2 border-black shadow-[2px_2px_0px_#000000]'
                            : 'opacity-75 hover:opacity-100 font-medium'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span>Light</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setColorMode('dark')}
                        className={`py-1.5 px-3 rounded-full font-dm text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          colorMode === 'dark'
                            ? isMinimal
                              ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] font-semibold shadow-xs'
                              : 'bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)] font-extrabold border-2 border-[#F5F5F0]'
                            : 'opacity-75 hover:opacity-100 font-medium'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>Dark</span>
                      </button>
                    </div>
                  </div>

                  {/* Style Selection: Minimal vs Vivid */}
                  <span className="font-dm text-[10px] uppercase tracking-wider font-bold opacity-75 block mb-1.5 px-1">
                    Style
                  </span>
                  <div className="flex flex-col gap-2">
                    {/* Option 1: Minimal */}
                    <button
                      type="button"
                      onClick={() => {
                        setStyleMode('minimal');
                      }}
                      className={`w-full p-3 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        styleMode === 'minimal'
                          ? isDark
                            ? 'bg-white/[0.10] border border-[var(--theme-accent,#FF7A1A)]/60 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.45)] text-[#F5EDE4]'
                            : 'bg-white border border-[#7B5CD6]/45 shadow-[0_8px_20px_-4px_rgba(15,23,42,0.10)] text-[#0F172A]'
                          : isMinimal
                          ? isDark
                            ? 'bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] text-[#F5EDE4]'
                            : 'bg-white/60 hover:bg-white border border-slate-200/80 text-[#0F172A]'
                          : isDark
                          ? 'bg-[#262626] hover:bg-[#303030] border-2 border-[#F5F5F0] text-[#F5F5F0]'
                          : 'bg-white hover:bg-[#FFF8ED] border-2 border-black text-black'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-6 h-6 rounded-full shrink-0 border ${
                            isDark ? 'border-white/25' : 'border-indigo-300/60'
                          }`}
                          style={{
                            background: isDark
                              ? 'linear-gradient(135deg, #14100D 0%, #2A1B12 55%, #FF7A1A 100%)'
                              : 'linear-gradient(135deg, #BFD8FA 0%, #DCE3FA 55%, #7B5CD6 100%)',
                          }}
                        />
                        <span
                          className="text-sm font-semibold block leading-tight"
                          style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
                        >
                          Minimal ({isDark ? 'Dark' : 'Light'})
                        </span>
                      </div>
                      {styleMode === 'minimal' && (
                        <Check className={`w-4 h-4 shrink-0 mt-1 ${isDark ? 'text-[var(--theme-accent,#FF7A1A)]' : 'text-[#7B5CD6]'}`} />
                      )}
                    </button>

                    {/* Option 2: Vivid */}
                    <button
                      type="button"
                      onClick={() => {
                        setStyleMode('vivid');
                      }}
                      className={`w-full p-3 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        styleMode === 'vivid'
                          ? isDark
                            ? 'bg-[#262626] border-2 border-[var(--vivid-accent,#D4FF3F)] shadow-[3px_3px_0px_var(--vivid-accent,#D4FF3F)] text-[#F5F5F0]'
                            : 'bg-[#FFD84D] border-2 border-black shadow-[3px_3px_0px_#000000] text-black'
                          : isMinimal
                          ? isDark
                            ? 'bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] text-[#F5EDE4]'
                            : 'bg-white/60 hover:bg-white border border-slate-200/80 text-[#0F172A]'
                          : isDark
                          ? 'bg-[#262626] hover:bg-[#303030] border-2 border-[#F5F5F0] text-[#F5F5F0]'
                          : 'bg-white hover:bg-[#FFD84D] border-2 border-black text-black'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-6 h-6 rounded-full shrink-0 border-2 ${
                            isDark ? 'border-[#F5F5F0]' : 'border-black'
                          }`}
                          style={{
                            background: isDark
                              ? 'linear-gradient(135deg, #D4FF3F 0%, #B968F0 50%, #FF8A1F 100%)'
                              : 'linear-gradient(135deg, #FF851B 0%, #FFD84D 50%, #25D6C1 100%)',
                          }}
                        />
                        <span className="font-cormorant text-sm font-bold block leading-tight">
                          Vivid ({isDark ? 'Dark' : 'Light'})
                        </span>
                      </div>
                      {styleMode === 'vivid' && (
                        <Check
                          className={`w-4 h-4 shrink-0 mt-1 stroke-[2.5] ${
                            isDark ? 'text-[var(--vivid-accent,#D4FF3F)]' : 'text-black'
                          }`}
                        />
                      )}
                    </button>

                    {/* Color Studio Accent Swatches */}
                    <div className="mt-1 pt-2 border-t border-current/15">
                      <span className="font-dm text-[10px] uppercase tracking-wider font-bold opacity-80 block mb-1.5 px-1">
                        Color Studio Accent
                      </span>
                      <div className="flex items-center justify-between gap-1 px-1">
                        {COLOR_STUDIO_PRESETS.map((preset) => {
                          const isSelected = accentColor.toUpperCase() === preset.hex.toUpperCase();
                          const isLightHex = preset.hex.toUpperCase() === '#7B5CD6';
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setAccentColor(preset.hex)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                                isMinimal
                                  ? isDark
                                    ? 'border border-white/30'
                                    : 'border border-slate-400/60'
                                  : isDark
                                  ? 'border-2 border-[#F5F5F0]'
                                  : 'border-2 border-black'
                              } ${isSelected ? 'scale-110 shadow-[2px_2px_0px_currentColor]' : 'opacity-85 hover:opacity-100 hover:scale-105'}`}
                              style={{ backgroundColor: preset.hex }}
                              title={`Color Studio: ${preset.label} (${preset.hex})`}
                              aria-label={`Select ${preset.label} accent`}
                            >
                              {isSelected && (
                                <Check
                                  className={`w-3.5 h-3.5 stroke-[3] ${
                                    isLightHex ? 'text-white' : 'text-[#0D0D0D]'
                                  }`}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Open Side-by-Side Style Chooser */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowStyleMenu(false);
                        setIsStyleChooserOpen(true);
                      }}
                      className="btn-pill-secondary mt-1 w-full py-2 px-3 text-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Open Full Style Chooser</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowStyleMenu(false);
                setShowUserMenu(false);
              }}
              className={
                isMinimal
                  ? isDark
                    ? 'relative w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.14] shadow-[0_4px_14px_-3px_rgba(0,0,0,0.45)] flex items-center justify-center text-[#F5EDE4] transition-all duration-150 cursor-pointer'
                    : 'relative w-9 h-9 rounded-full bg-white/85 hover:bg-white border border-slate-200/80 shadow-[0_4px_14px_-3px_rgba(15,23,42,0.08)] flex items-center justify-center text-[#0F172A] transition-all duration-150 cursor-pointer'
                  : isDark
                  ? 'relative w-9 h-9 rounded-full bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] flex items-center justify-center text-[#F5F5F0] hover:text-[var(--vivid-accent-fg,#0D0D0D)] transition-all duration-150 cursor-pointer'
                  : 'relative w-9 h-9 rounded-full bg-[#FFD84D] hover:bg-[#FF851B] border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center justify-center text-black transition-all duration-150 cursor-pointer'
              }
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span
                  className={
                    isMinimal
                      ? isDark
                        ? 'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--theme-accent,#FF7A1A)] border border-[#14100D]'
                        : 'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--theme-accent,#7B5CD6)] border border-white'
                      : isDark
                      ? 'absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#FF8A1F] border-2 border-[#F5F5F0]'
                      : 'absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#FF851B] border-2 border-black'
                  }
                />
              )}
            </button>

            {showNotifications && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setShowNotifications(false)}
                />
                <div className="absolute right-0 mt-3 w-80 glass-modal p-4 z-50 animate-dropdown-enter">
                  <div className="flex items-center justify-between pb-2.5 border-b-2 border-black px-1">
                    <span className="font-dm text-xs font-extrabold uppercase tracking-wider">
                      Alerts
                    </span>
                    <span
                      className={
                        isMinimal
                          ? isDark
                            ? 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.08] text-[var(--theme-accent,#FF7A1A)] border border-white/[0.14]'
                            : 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-[#0F172A] border border-slate-200/80'
                          : isDark
                          ? 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--vivid-accent,#D4FF3F)] text-[var(--vivid-accent-fg,#0D0D0D)] border border-[#F5F5F0]'
                          : 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FFD84D] text-black border border-black'
                      }
                    >
                      {notifications.length} Recorded
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 mt-3">
                    {notifications.length > 0 ? (
                      notifications.map((n) => {
                        const NotifIcon = n.Icon;
                        return (
                          <div
                            key={n.id}
                            className="flex items-start gap-2.5 p-2.5 rounded-2xl tactile-inner text-left"
                          >
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${n.badgeBg}`}>
                              <NotifIcon className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-bold leading-tight">
                                {n.title}
                              </span>
                              <span className="text-[11px] opacity-70 mt-0.5 tabular-nums">
                                {n.time}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-6 text-center text-xs opacity-75 font-dm">
                        No notifications recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User Profile & Real Google Account dropdown */}
          <div className="relative">
            <div
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowStyleMenu(false);
                setShowNotifications(false);
              }}
              className="flex items-center gap-2 pl-1 cursor-pointer group transition-transform duration-150 hover:scale-105 active:scale-95"
              title={currentUser?.displayName || `${userName} (Vision Core)`}
            >
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || userName}
                  referrerPolicy="no-referrer"
                  className={
                    isMinimal
                      ? isDark
                        ? 'w-9 h-9 rounded-full object-cover border border-white/[0.18] shadow-xs'
                        : 'w-9 h-9 rounded-full object-cover border border-white/90 shadow-xs'
                      : isDark
                      ? 'w-9 h-9 rounded-full object-cover border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                      : 'w-9 h-9 rounded-full object-cover border-2 border-black shadow-[2px_2px_0px_#000000]'
                  }
                />
              ) : (
                <div
                  className={
                    isMinimal
                      ? isDark
                        ? 'w-9 h-9 rounded-full bg-white/[0.10] text-[#F5EDE4] text-xs flex items-center justify-center font-semibold border border-white/[0.18] shadow-xs'
                        : 'w-9 h-9 rounded-full bg-white/90 text-[#0F172A] text-xs flex items-center justify-center font-semibold border border-slate-200/80 shadow-xs'
                      : isDark
                      ? 'w-9 h-9 rounded-full bg-[#B968F0] text-[#0D0D0D] text-xs flex items-center justify-center font-extrabold border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                      : 'w-9 h-9 rounded-full bg-[#C77DFF] text-black text-xs flex items-center justify-center font-extrabold border-2 border-black shadow-[2px_2px_0px_#000000]'
                  }
                >
                  {currentUser?.displayName ? currentUser.displayName[0].toUpperCase() : (userName[0] || 'U').toUpperCase()}
                </div>
              )}
            </div>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-3 w-72 glass-modal p-4 z-50 animate-dropdown-enter">
                  <div className="flex items-center gap-3 pb-3 border-b-2 border-black">
                    {currentUser?.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Profile"
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border-2 border-black"
                      />
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-full text-sm flex items-center justify-center font-extrabold border-2 border-black ${
                          isMinimal
                            ? isDark
                              ? 'bg-white/[0.10] text-[#F5EDE4]'
                              : 'bg-white text-[#0F172A]'
                            : isDark
                            ? 'bg-[#B968F0] text-[#0D0D0D]'
                            : 'bg-[#C77DFF] text-black'
                        }`}
                      >
                        {currentUser?.displayName ? currentUser.displayName[0].toUpperCase() : (userName[0] || 'U').toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-bold truncate">
                        {currentUser?.displayName || userName}
                      </span>
                      <span className="text-xs opacity-75 truncate">
                        {currentUser?.email || `${userName.toLowerCase().replace(/\s+/g, '.')}@iris-vision.ai`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-3">
                    {onOpenOnboarding && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          onOpenOnboarding();
                        }}
                        className="btn-pill-secondary w-full justify-start text-xs py-2 px-3.5"
                      >
                        <OrbitingEyeLogo size={16} className="w-4 h-4 shrink-0" />
                        <span>Camera Setup</span>
                      </button>
                    )}

                    {onOpenDocs && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          onOpenDocs();
                        }}
                        className="btn-pill-secondary w-full justify-start text-xs py-2 px-3.5"
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Specs &amp; QA Plan</span>
                      </button>
                    )}

                    {onSignOut && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          onSignOut();
                        }}
                        className="btn-pill-primary w-full justify-start text-xs py-2 px-3.5 mt-1"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Sign Out of Iris AI</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
