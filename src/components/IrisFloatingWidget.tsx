import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { BehaviorMode, WidgetState } from '../types';
import { AnimatedRollingNumber } from './AnimatedRollingNumber';
import { IRIS_LOGO_WHITE_DATA_URL } from '../assets/irisLogo';

export const IrisFloatingWidget: React.FC = () => {
  const [activeMode, setActiveMode] = useState<BehaviorMode>('default');
  const [telemetry, setTelemetry] = useState<{
    blinkRate: number | null;
    screenDistance: number | null;
    isTracking: boolean;
    faceDetected?: boolean;
    fatigueScore: number | null;
    isTooClose?: boolean;
    secondsSinceLastBlink?: number;
    requiredBlinks?: number;
  }>({
    blinkRate: 15,
    screenDistance: 52,
    isTracking: true,
    faceDetected: true,
    fatigueScore: 1.0,
    isTooClose: false,
    secondsSinceLastBlink: 0,
    requiredBlinks: 0,
  });
  const [responsiveScale, setResponsiveScale] = useState<number>(1.0);
  const [widgetDesign, setWidgetDesign] = useState<'liquid-glass' | 'dark-vivid'>('dark-vivid');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isMegaMaximized, setIsMegaMaximized] = useState<boolean>(false);
  const [activeBlinkTarget, setActiveBlinkTarget] = useState<number>(1);
  const [blinksCompleted, setBlinksCompleted] = useState<number>(0);
  const [challengeJustCompleted, setChallengeJustCompleted] = useState<boolean>(false);
  const [isGrabbing, setIsGrabbing] = useState<boolean>(false);
  const [isFaceMissing, setIsFaceMissing] = useState<boolean>(false);
  const [isBlinkPulsing, setIsBlinkPulsing] = useState<boolean>(false);

  // Widget screen coordinates within the full workArea canvas
  const [windowDims, setWindowDims] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  const [widgetPos, setWidgetPos] = useState<{ x: number; y: number }>(() => {
    const initW = typeof window !== 'undefined' ? window.innerWidth : 1920;
    return {
      x: Math.round((initW - 204) / 2),
      y: 12,
    };
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const autoCollapseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const megaMaximizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastChimeMsRef = useRef<number>(0);
  const lastStateWasTooCloseRef = useRef<boolean>(false);
  const blinkAlertCooldownUntilRef = useRef<number>(0);
  const lastFaceSeenRef = useRef<number>(Date.now());
  const pulseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Custom Smooth Dragging Engine Refs
  const isDraggingRef = useRef<boolean>(false);
  const pointerStartRef = useRef<{ screenX: number; screenY: number } | null>(null);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => {
      setWindowDims({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Transparent Canvas Mouse Event Pass-Through
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // If actively dragging, keep mouse events active
      if (isDraggingRef.current || pointerStartRef.current) {
        window.irisNative?.setWidgetIgnoreMouseEvents?.(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      const isInteractive = Boolean(target?.closest('[data-widget-interactive]'));
      window.irisNative?.setWidgetIgnoreMouseEvents?.(!isInteractive, { forward: true });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Play subtle procedural Web Audio sounds (Default mode only)
  const playWebAudioChime = useCallback((type: 'alert' | 'complete') => {
    if (activeMode === 'meeting') return; // Strict silence in Meeting mode
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'alert') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.16);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.34);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.14);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.14, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch {
      // AudioContext unavailable or unpermitted
    }
  }, [activeMode]);

  // Sync state from Electron main process
  useEffect(() => {
    window.irisNative?.getWidgetState?.().then((state) => {
      if (state) {
        if (state.activeMode) {
          setActiveMode(String(state.activeMode).toLowerCase() as BehaviorMode);
        }
        if (state.telemetry) {
          setTelemetry((prev) => ({
            ...prev,
            ...state.telemetry,
            blinkRate: state.telemetry.blinkRate ?? prev.blinkRate ?? 15,
            screenDistance: state.telemetry.screenDistance ?? prev.screenDistance ?? 52,
          }));
          if (state.telemetry.faceDetected) {
            lastFaceSeenRef.current = Date.now();
            setIsFaceMissing(false);
          }
        }
        if (state.responsiveScale) setResponsiveScale(state.responsiveScale);
        if (state.widgetDesign === 'liquid-glass' || state.widgetDesign === 'dark-vivid') {
          setWidgetDesign(state.widgetDesign);
        }
        if (
          state.savedPosition &&
          typeof state.savedPosition.x === 'number' &&
          typeof state.savedPosition.y === 'number'
        ) {
          const clampedX = Math.max(12, Math.min(window.innerWidth - 220, state.savedPosition.x));
          const clampedY = Math.max(12, Math.min(window.innerHeight - 60, state.savedPosition.y));
          setWidgetPos({ x: clampedX, y: clampedY });
        }
      }
    }).catch(() => {});

    const unsubState = window.irisNative?.onWidgetStateUpdate?.((state: WidgetState) => {
      if (state.activeMode) {
        setActiveMode(String(state.activeMode).toLowerCase() as BehaviorMode);
      }
      if (state.widgetDesign === 'liquid-glass' || state.widgetDesign === 'dark-vivid') {
        setWidgetDesign(state.widgetDesign);
      }
      if (state.telemetry) {
        setTelemetry((prev) => ({
          ...prev,
          ...state.telemetry,
          blinkRate: state.telemetry.blinkRate ?? prev.blinkRate ?? 15,
          screenDistance: state.telemetry.screenDistance ?? prev.screenDistance ?? 52,
        }));
        if (state.telemetry.faceDetected) {
          lastFaceSeenRef.current = Date.now();
          setIsFaceMissing(false);
        }
      }
      if (state.responsiveScale) setResponsiveScale(state.responsiveScale);
    });

    const unsubDesign = window.irisNative?.onWidgetDesignUpdate?.((design) => {
      if (design === 'liquid-glass' || design === 'dark-vivid') {
        setWidgetDesign(design);
      }
    });

    return () => {
      if (unsubState) unsubState();
      if (unsubDesign) unsubDesign();
    };
  }, []);

  // Periodic Face Missing Check (1.5s grace period)
  useEffect(() => {
    const timer = setInterval(() => {
      const faceIsOld = Date.now() - lastFaceSeenRef.current >= 1500;
      const faceLost = !telemetry.isTracking || telemetry.faceDetected === false || faceIsOld;
      setIsFaceMissing(faceLost);
    }, 250);

    return () => clearInterval(timer);
  }, [telemetry.isTracking, telemetry.faceDetected]);

  // Rolling numbers (never display '--')
  const displayBlink = Math.round(telemetry.blinkRate ?? 15);
  const displayDist = Math.round(telemetry.screenDistance ?? 52);

  // Dynamic Blink Target Calculation (1, 2, or 3)
  const isCooldownActive = Date.now() < blinkAlertCooldownUntilRef.current;
  const currentBlinkTarget = isCooldownActive
    ? 0
    : telemetry.requiredBlinks && telemetry.requiredBlinks > 0
    ? telemetry.requiredBlinks
    : displayBlink <= 5
    ? 3
    : displayBlink <= 10
    ? 2
    : displayBlink < 15
    ? 1
    : 0;

  // Distance alerts are 100% deterministic and repeatable: ZERO cooldown suppression!
  const isBlinkAlert = currentBlinkTarget > 0;
  const isDistanceAlert = Boolean(telemetry.isTooClose);
  const isCritical = isBlinkAlert || isDistanceAlert;

  const handleCollapse = useCallback(() => {
    if (autoCollapseTimerRef.current) {
      clearTimeout(autoCollapseTimerRef.current);
      autoCollapseTimerRef.current = null;
    }
    if (megaMaximizeTimerRef.current) {
      clearTimeout(megaMaximizeTimerRef.current);
      megaMaximizeTimerRef.current = null;
    }
    setIsMegaMaximized(false);
    setIsExpanded(false);
    setBlinksCompleted(0);
    setChallengeJustCompleted(false);
  }, []);

  // Level-Triggered Distance Recovery Watcher:
  // When user moves back (>= 40 cm or isTooClose === false), immediately cancel mega-maximize & collapse
  useEffect(() => {
    const isNowSafeDistance = telemetry.isTooClose === false || (telemetry.screenDistance !== null && telemetry.screenDistance >= 40);

    if (isNowSafeDistance) {
      if (lastStateWasTooCloseRef.current) {
        lastStateWasTooCloseRef.current = false;

        if (megaMaximizeTimerRef.current) {
          clearTimeout(megaMaximizeTimerRef.current);
          megaMaximizeTimerRef.current = null;
        }

        // Cancel mega maximize immediately on distance recovery
        setIsMegaMaximized(false);

        // If no incomplete blink challenge is active, collapse widget back down immediately
        if (activeBlinkTarget === 0 || blinksCompleted >= activeBlinkTarget || currentBlinkTarget === 0) {
          handleCollapse();
        }
      }
    } else if (telemetry.isTooClose) {
      lastStateWasTooCloseRef.current = true;
    }
  }, [telemetry.isTooClose, telemetry.screenDistance, activeBlinkTarget, blinksCompleted, currentBlinkTarget, handleCollapse]);

  // Reactivity & Auto-Expansion in Normal (Default) Mode
  useEffect(() => {
    if (activeMode === 'default') {
      if (isCritical && !isExpanded) {
        const target = currentBlinkTarget > 0 ? currentBlinkTarget : 1;
        setActiveBlinkTarget(target);
        setBlinksCompleted(0);
        setChallengeJustCompleted(false);
        setIsExpanded(true);

        const now = Date.now();
        if (now - lastChimeMsRef.current > 15000) {
          lastChimeMsRef.current = now;
          playWebAudioChime('alert');
        }

        // 10-Second Escalation to Floating Curved Card "Mega Maximize" Alert in Default Mode
        if (megaMaximizeTimerRef.current) clearTimeout(megaMaximizeTimerRef.current);
        megaMaximizeTimerRef.current = setTimeout(() => {
          setIsMegaMaximized(true);
        }, 10000);
      } else if (!isCritical && isExpanded) {
        if (activeBlinkTarget === 0 || blinksCompleted >= activeBlinkTarget) {
          handleCollapse();
        }
      }
    } else if (activeMode === 'meeting' || activeMode === 'gaming') {
      if (isExpanded || isMegaMaximized) {
        handleCollapse();
      }
    }
  }, [isCritical, activeMode, isExpanded, isMegaMaximized, currentBlinkTarget, activeBlinkTarget, blinksCompleted, playWebAudioChime, handleCollapse]);

  // Listen to live blink detection pulses
  useEffect(() => {
    const unsubBlink = window.irisNative?.onLiveBlinkDetected?.((blinkData?: any) => {
      // Immediately reflect live rolling blink rate on the widget
      if (blinkData?.blinkRate) {
        setTelemetry((prev) => ({
          ...prev,
          blinkRate: blinkData.blinkRate,
        }));
      }

      // Micro-pulse animation trigger
      setIsBlinkPulsing(true);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = setTimeout(() => {
        setIsBlinkPulsing(false);
      }, 160);

      if (isExpanded || isMegaMaximized) {
        setBlinksCompleted((prev) => {
          const next = Math.min(activeBlinkTarget, prev + 1);

          if (next >= activeBlinkTarget) {
            setChallengeJustCompleted(true);
            playWebAudioChime('complete');
            blinkAlertCooldownUntilRef.current = Date.now() + 45000;
            window.irisNative?.notifyBlinkChallengeCompleted?.();
            if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current);
            // Instant smooth collapse to compact pill on reaching target
            autoCollapseTimerRef.current = setTimeout(() => {
              handleCollapse();
              setChallengeJustCompleted(false);
            }, 350);
          }
          return next;
        });
      }
    });

    const unsubChallenge = window.irisNative?.onBlinkChallengeCompleted?.(() => {
      handleCollapse();
    });

    return () => {
      if (unsubBlink) unsubBlink();
      if (unsubChallenge) unsubChallenge();
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, [isExpanded, isMegaMaximized, activeBlinkTarget, playWebAudioChime, handleCollapse]);

  const handleOpenIrisApp = () => {
    window.irisNative?.focusMainWindow?.();
  };

  // Pointer drag event handlers (smooth dragging anywhere, zero click conflicts)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (currentState === 'mega') return; // Do not drag while in Mega Maximize card state
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, [data-no-drag="true"]')) return;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    pointerStartRef.current = { screenX: e.screenX, screenY: e.screenY };
    isDraggingRef.current = false;
    setIsGrabbing(true);
    window.irisNative?.setWidgetIgnoreMouseEvents?.(false);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStartRef.current || currentState === 'mega') return;
    const deltaX = e.screenX - pointerStartRef.current.screenX;
    const deltaY = e.screenY - pointerStartRef.current.screenY;

    if (!isDraggingRef.current) {
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        isDraggingRef.current = true;
      }
    }

    if (isDraggingRef.current) {
      setWidgetPos((prev) => {
        const maxX = Math.max(12, windowDims.width - targetWidth - 12);
        const maxY = Math.max(12, windowDims.height - targetHeight - 12);
        const nextX = Math.min(maxX, Math.max(12, Math.round(prev.x + deltaX)));
        const nextY = Math.min(maxY, Math.max(12, Math.round(prev.y + deltaY)));
        return { x: nextX, y: nextY };
      });
      pointerStartRef.current = { screenX: e.screenX, screenY: e.screenY };
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const wasDragging = isDraggingRef.current;
    pointerStartRef.current = null;
    isDraggingRef.current = false;
    setIsGrabbing(false);

    if (wasDragging) {
      window.irisNative?.saveWidgetPosition?.(widgetPos.x, widgetPos.y);
    } else {
      // Clean click handling
      if (currentState === 'circle') {
        handleOpenIrisApp();
      } else if (activeMode === 'meeting' || activeMode === 'gaming') {
        handleOpenIrisApp();
      } else if (activeMode === 'default' && isCritical && !isExpanded && !isMegaMaximized) {
        setIsExpanded(true);
      }
    }
  };

  // Status colors
  const getBlinkRateColor = () => {
    if (!telemetry.isTracking) return '#99999F';
    if (displayBlink >= 14) return '#27C93F';
    if (displayBlink >= 10) return '#FFBD2E';
    return '#FF5F56';
  };

  const getDistanceColor = () => {
    if (!telemetry.isTracking) return '#99999F';
    if (displayDist > 0 && displayDist < 38) return '#FF453A';
    if (displayDist >= 38 && displayDist < 40) return '#F59E0B';
    return '#27C93F';
  };

  const isDistanceWarning = (displayDist > 0 && displayDist < 38) || Boolean(telemetry.isTooClose);

  const scale = responsiveScale || 1.0;

  // Determine State:
  // State 0: 'circle' (No face detected)
  // State 1: 'pill' (Face detected, minimized telemetry pill)
  // State 2: 'expanded' (Initial alert card / blink challenge)
  // State 3: 'mega' (10-second escalation: large curved floating card)
  type WidgetStage = 'circle' | 'pill' | 'expanded' | 'mega';

  const currentState: WidgetStage = isMegaMaximized
    ? 'mega'
    : isExpanded
    ? 'expanded'
    : isFaceMissing
    ? 'circle'
    : 'pill';

  // Mega card responsive dimensions (78vw × 74vh, clamped: min 720x480, max 1180x720)
  const megaWidth = Math.min(1180, Math.max(720, Math.round(windowDims.width * 0.78)));
  const megaHeight = Math.min(720, Math.max(480, Math.round(windowDims.height * 0.74)));

  // Symmetrical Invariant Math: Anchored to the exact center of the pill
  const pillWidth = Math.round(196 * scale);
  const pillHeight = Math.round(42 * scale);
  const centerX = widgetPos.x + pillWidth / 2;

  let targetWidth = pillWidth;
  let targetHeight = pillHeight;
  let targetBorderRadius = Math.round(21 * scale);

  if (currentState === 'circle') {
    targetWidth = Math.round(42 * scale);
    targetHeight = Math.round(42 * scale);
    targetBorderRadius = 999;
  } else if (currentState === 'expanded') {
    targetWidth = Math.round(340 * scale);
    targetHeight = Math.round(174 * scale);
    targetBorderRadius = Math.round(24 * scale);
  } else if (currentState === 'mega') {
    targetWidth = megaWidth;
    targetHeight = megaHeight;
    targetBorderRadius = 56;
  }

  // Calculate targetLeft & targetTop:
  // For non-mega states, anchor targetTop to widgetPos.y (expanding downwards)
  // and clamp so it never pushes off the screen edges
  let targetLeft = currentState === 'mega'
    ? Math.round((windowDims.width - megaWidth) / 2)
    : Math.max(12, Math.min(windowDims.width - targetWidth - 12, Math.round(centerX - targetWidth / 2)));
  let targetTop = currentState === 'mega'
    ? Math.round((windowDims.height - megaHeight) / 2)
    : Math.max(12, Math.min(windowDims.height - targetHeight - 12, widgetPos.y));

  // Determine Meeting Mode prompt text
  let meetingPromptText: string | null = null;
  if (activeMode === 'meeting' && isCritical) {
    if (isDistanceAlert && isBlinkAlert) {
      meetingPromptText = 'Move back | Blink';
    } else if (isDistanceAlert) {
      meetingPromptText = 'Move away';
    } else if (currentBlinkTarget === 3) {
      meetingPromptText = 'Blink thrice';
    } else if (currentBlinkTarget === 2) {
      meetingPromptText = 'Blink twice';
    } else {
      meetingPromptText = 'Blink once';
    }
  }

  // Expanded headline in Normal Mode
  const expandedBlinkHeadline = activeBlinkTarget === 3
    ? 'Blink thrice'
    : activeBlinkTarget === 2
    ? 'Blink twice'
    : 'Blink once';

  // Visual Theme Engine (Liquid Glass vs Dark / Vivid)
  const isLiquid = widgetDesign === 'liquid-glass';

  const containerBg = isLiquid
    ? currentState === 'mega'
      ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, rgba(18, 24, 38, 0.88) 40%, rgba(10, 14, 24, 0.96) 100%)'
      : currentState === 'expanded'
      ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.24) 0%, rgba(20, 26, 40, 0.85) 50%, rgba(12, 16, 26, 0.94) 100%)'
      : 'rgba(255, 255, 255, 0.22)'
    : currentState === 'mega'
    ? 'rgba(12, 12, 16, 0.96)'
    : currentState === 'expanded'
    ? 'rgba(12, 12, 16, 0.94)'
    : 'rgba(12, 12, 16, 0.92)';

  const containerBorder = isCritical && activeMode === 'gaming'
    ? '2px solid #FF5F56'
    : isDistanceWarning
    ? '1.5px solid rgba(255, 69, 58, 0.75)'
    : isLiquid
    ? currentState === 'mega'
      ? '1.5px solid rgba(255, 255, 255, 0.40)'
      : '1.5px solid rgba(255, 255, 255, 0.45)'
    : currentState === 'mega'
    ? '1.5px solid rgba(255, 255, 255, 0.16)'
    : '1.5px solid rgba(255, 255, 255, 0.18)';

  const containerBackdrop = isLiquid
    ? currentState === 'mega'
      ? 'blur(36px) saturate(160%)'
      : 'blur(24px) saturate(180%)'
    : currentState === 'mega'
    ? 'blur(28px)'
    : currentState === 'expanded'
    ? 'blur(24px)'
    : 'blur(20px)';

  const containerShadow = isCritical && activeMode === 'gaming'
    ? '0 0 14px rgba(255, 95, 86, 0.8), inset 0 1.5px 1px rgba(255, 255, 255, 0.9), inset 0 -2px 4px rgba(0, 0, 0, 0.3)'
    : isDistanceWarning
    ? '0 0 14px rgba(255, 69, 58, 0.45), inset 0 1px 1.5px rgba(255, 255, 255, 0.6), 0 8px 24px rgba(0, 0, 0, 0.35)'
    : isLiquid
    ? currentState === 'mega'
      ? '0 32px 84px rgba(0, 0, 0, 0.75), inset 0 1.5px 1.5px rgba(255, 255, 255, 0.75), inset 0 -3px 8px rgba(0, 0, 0, 0.4), inset 0 0 32px rgba(255, 255, 255, 0.08)'
      : currentState === 'expanded'
      ? 'inset 0 1px 1.5px rgba(255, 255, 255, 0.65), inset 0 -2px 5px rgba(0, 0, 0, 0.25), 0 16px 36px rgba(0, 0, 0, 0.28)'
      : 'inset 0 1px 1.5px rgba(255, 255, 255, 0.65), inset 0 -2px 5px rgba(0, 0, 0, 0.25), 0 16px 36px rgba(0, 0, 0, 0.28)'
    : currentState === 'mega'
    ? '0 28px 80px rgba(0, 0, 0, 0.75), inset 0 1px 1.5px rgba(255, 255, 255, 0.22)'
    : currentState === 'expanded'
    ? 'inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 4px 16px rgba(0, 0, 0, 0.5)'
    : 'inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 4px 12px rgba(0, 0, 0, 0.45)';

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.irisNative?.showWidgetContextMenu?.({
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
    });
  };

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden pointer-events-none"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: 'transparent',
      }}
    >
      {/* ================= UNIFIED DYNAMIC ISLAND 4-STAGE MORPH CONTAINER ================= */}
      <div
        data-widget-interactive="true"
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          position: 'absolute',
          left: `${targetLeft}px`,
          top: `${targetTop}px`,
          width: `${targetWidth}px`,
          height: `${targetHeight}px`,
          borderRadius: `${targetBorderRadius}px`,
          transformOrigin: 'center top',
          backgroundColor: containerBg,
          backdropFilter: containerBackdrop,
          WebkitBackdropFilter: containerBackdrop,
          border: containerBorder,
          boxShadow: containerShadow,
          transition:
            'left 480ms cubic-bezier(0.22, 1, 0.36, 1), top 480ms cubic-bezier(0.22, 1, 0.36, 1), width 480ms cubic-bezier(0.22, 1, 0.36, 1), height 480ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 480ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 350ms ease, border-color 350ms ease, background-color 350ms ease',
          touchAction: 'none',
          overflow: 'hidden',
          pointerEvents: 'auto',
          zIndex: 9999,
        }}
        className={`select-none flex items-center justify-center ${
          currentState === 'mega'
            ? 'cursor-default'
            : isGrabbing
            ? 'cursor-grabbing'
            : 'cursor-grab'
        }`}
        title={
          currentState === 'mega'
            ? 'Pupil Priority Alert'
            : currentState === 'circle'
            ? 'Pupil (Searching for face...) - Click to open IRIS'
            : 'Pupil Widget - Click to focus IRIS, or drag anywhere across screen'
        }
      >
        {/* ================= LIQUID GLASS REFRACTION & SPECULAR GLARE OVERLAYS ================= */}
        {isLiquid && (
          <>
            {/* Ambient Iridescent Refraction Tint */}
            <div
              className="absolute inset-0 pointer-events-none rounded-[inherit]"
              style={{
                background:
                  currentState === 'circle'
                    ? 'radial-gradient(circle at 35% 25%, rgba(120, 210, 255, 0.35) 0%, rgba(200, 160, 255, 0.15) 50%, transparent 80%)'
                    : 'radial-gradient(ellipse at 35% 0%, rgba(120, 200, 255, 0.28) 0%, rgba(200, 160, 255, 0.14) 45%, transparent 75%)',
                mixBlendMode: 'screen',
                transition: 'opacity 300ms ease',
              }}
            />
            {/* Curved Specular Liquid Top Glare Sweep */}
            <div
              className="absolute inset-x-0 top-0 pointer-events-none rounded-t-[inherit]"
              style={{
                height: currentState === 'circle' ? '50%' : currentState === 'mega' ? '38%' : '48%',
                background:
                  'linear-gradient(180deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.15) 42%, transparent 100%)',
                transition: 'height 480ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </>
        )}
        {/* ================= STAGE 0: CIRCULAR NO-FACE LOGO BADGE ================= */}
        <div
          style={{
            opacity: currentState === 'circle' ? 1 : 0,
            transform: currentState === 'circle' ? 'scale(1)' : 'scale(0.75)',
            pointerEvents: currentState === 'circle' ? 'auto' : 'none',
            transition: 'opacity 240ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            width: '100%',
            height: '100%',
          }}
          className="absolute inset-0 flex items-center justify-center p-0 overflow-hidden"
        >
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow: isLiquid
                ? isBlinkPulsing
                  ? '0 0 16px rgba(56, 189, 248, 0.75), inset 0 2px 2px rgba(255, 255, 255, 0.95)'
                  : 'inset 0 2px 2px rgba(255, 255, 255, 0.9), inset 0 -2px 4px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.3)'
                : isBlinkPulsing
                ? '0 0 12px rgba(39, 201, 63, 0.45)'
                : '0 0 8px rgba(255, 255, 255, 0.08)',
              transition: 'box-shadow 160ms ease',
            }}
          />
          <img
            src={IRIS_LOGO_WHITE_DATA_URL}
            alt="IRIS"
            style={{
              width: `${Math.round(26 * scale)}px`,
              height: `${Math.round(26 * scale)}px`,
              objectFit: 'contain',
              margin: 0,
              padding: 0,
              display: 'block',
              transform: isBlinkPulsing ? 'scale(1.15)' : 'none',
              transition: 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)',
              filter: isLiquid ? 'brightness(0)' : 'none',
            }}
          />
        </div>

        {/* ================= STAGE 1: MINIMIZED DYNAMIC ISLAND PILL ================= */}
        <div
          style={{
            opacity: currentState === 'pill' ? 1 : 0,
            transform: currentState === 'pill' ? 'scale(1)' : 'scale(0.92)',
            pointerEvents: currentState === 'pill' ? 'auto' : 'none',
            transition: 'opacity 240ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            width: `${pillWidth}px`,
            height: `${pillHeight}px`,
          }}
          className="absolute inset-0 px-2.5"
        >
          {activeMode === 'meeting' && meetingPromptText ? (
            /* Meeting Mode In-Pill Discreet Alert Prompt */
            <div
              className="w-full h-full flex items-center justify-center gap-1.5 text-center cursor-pointer"
              onClick={handleOpenIrisApp}
              data-no-drag="true"
            >
              <span className={`w-2 h-2 rounded-full ${isLiquid ? 'bg-black' : 'bg-amber-400'} animate-ping flex-shrink-0`} />
              <span
                style={{
                  fontSize: `${Math.round(11 * scale)}px`,
                  color: isLiquid ? '#000000' : '#FBBF24',
                }}
                className="font-semibold tracking-wide truncate"
              >
                {meetingPromptText}
              </span>
            </div>
          ) : (
            <div
              className="w-full h-full grid items-center"
              style={{
                gridTemplateColumns: '1fr auto auto auto 1fr',
              }}
            >
              {/* Left Wing: Blink Rate with Animated Rolling Numbers */}
              <div
                className="flex flex-col items-start leading-none justify-center pointer-events-none transition-all duration-300"
                style={{
                  opacity: currentState === 'pill' ? 1 : 0,
                  transform: currentState === 'pill' ? 'translateX(0)' : 'translateX(10px)',
                  justifySelf: 'start',
                }}
              >
                <span
                  style={{
                    fontSize: `${Math.max(8, Math.round(8.5 * scale))}px`,
                    color: isLiquid ? '#000000' : '#9CA3AF',
                  }}
                  className="font-semibold tracking-wider uppercase mb-0.5"
                >
                  Blink
                </span>
                <div className="flex items-baseline gap-0.5">
                  <AnimatedRollingNumber
                    value={displayBlink}
                    style={{
                      fontSize: `${Math.round(14 * scale)}px`,
                      color: isLiquid ? '#000000' : getBlinkRateColor(),
                      fontWeight: 700,
                    }}
                  />
                  <span
                    style={{
                      fontSize: `${Math.max(8, Math.round(8 * scale))}px`,
                      color: isLiquid ? '#111111' : '#71717A',
                    }}
                    className="font-medium"
                  >
                    /m
                  </span>
                </div>
              </div>

              {/* Left Vertical Divider */}
              <div
                style={{
                  width: '1px',
                  height: `${Math.round(18 * scale)}px`,
                  backgroundColor: isLiquid ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.15)',
                  margin: '0 5px',
                }}
                className="pointer-events-none"
              />

              {/* Center: Official IRIS App Launcher Emblem Button with live blink micro-pulse */}
              <button
                type="button"
                data-no-drag="true"
                style={{
                  width: `${Math.round(28 * scale)}px`,
                  height: `${Math.round(28 * scale)}px`,
                  padding: 0,
                  transform: isBlinkPulsing ? 'scale(1.10)' : 'scale(1)',
                  transition: 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                  backgroundColor: isLiquid ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)',
                  boxShadow: isLiquid ? 'inset 0 1px 1px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.12)' : 'none',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenIrisApp();
                }}
                className="flex items-center justify-center rounded-full hover:bg-white/30 transition justify-self-center cursor-pointer overflow-hidden"
                title="Open IRIS Dashboard"
              >
                <img
                  src={IRIS_LOGO_WHITE_DATA_URL}
                  alt="IRIS"
                  style={{
                    width: `${Math.round(24 * scale)}px`,
                    height: `${Math.round(24 * scale)}px`,
                    objectFit: 'contain',
                    transform: 'scale(1.04)',
                    filter: isLiquid ? 'brightness(0)' : 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.28))',
                    padding: 0,
                    margin: 0,
                  }}
                />
              </button>

              {/* Right Vertical Divider */}
              <div
                style={{
                  width: '1px',
                  height: `${Math.round(18 * scale)}px`,
                  backgroundColor: isLiquid ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.15)',
                  margin: '0 5px',
                }}
                className="pointer-events-none"
              />

              {/* Right Wing: Screen Distance with Animated Rolling Numbers */}
              <div
                className="flex flex-col items-end leading-none justify-center pointer-events-none transition-all duration-300"
                style={{
                  opacity: currentState === 'pill' ? 1 : 0,
                  transform: currentState === 'pill' ? 'translateX(0)' : 'translateX(-10px)',
                  justifySelf: 'end',
                }}
              >
                <span
                  style={{
                    fontSize: `${Math.max(8, Math.round(8.5 * scale))}px`,
                    color: isDistanceWarning ? '#FF453A' : isLiquid ? '#000000' : '#9CA3AF',
                  }}
                  className="font-semibold tracking-wider uppercase mb-0.5"
                >
                  Dist
                </span>
                <div className="flex items-baseline gap-0.5">
                  <AnimatedRollingNumber
                    value={displayDist}
                    style={{
                      fontSize: `${Math.round(14 * scale)}px`,
                      color: isDistanceWarning ? '#FF453A' : isLiquid ? '#000000' : getDistanceColor(),
                      fontWeight: 700,
                    }}
                  />
                  <span
                    style={{
                      fontSize: `${Math.max(8, Math.round(8 * scale))}px`,
                      color: isDistanceWarning ? '#FF453A' : isLiquid ? '#111111' : '#71717A',
                    }}
                    className="font-medium"
                  >
                    cm
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================= STAGE 2: EXPANDED DYNAMIC ISLAND CARD ================= */}
        <div
          style={{
            opacity: currentState === 'expanded' ? 1 : 0,
            transform: currentState === 'expanded' ? 'scale(1)' : 'scale(0.94)',
            pointerEvents: currentState === 'expanded' ? 'auto' : 'none',
            transition: 'opacity 240ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            width: `${Math.round(340 * scale)}px`,
            height: `${Math.round(174 * scale)}px`,
            padding: `${Math.round(14 * scale)}px ${Math.round(18 * scale)}px`,
          }}
          className="absolute inset-0 flex flex-col justify-between"
        >
          {/* Header Row */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="relative flex items-center justify-center">
                <img
                  src={IRIS_LOGO_WHITE_DATA_URL}
                  alt="IRIS"
                  style={{
                    width: `${Math.round(30 * scale)}px`,
                    height: `${Math.round(30 * scale)}px`,
                    objectFit: 'contain',
                    transform: 'scale(1.05)',
                    filter: isLiquid ? 'brightness(0)' : 'none',
                    padding: 0,
                  }}
                />
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: isCritical ? '#FF5F56' : '#27C93F',
                    boxShadow: isCritical ? '0 0 6px #FF5F56' : '0 0 6px #27C93F',
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: `${Math.round(12 * scale)}px`,
                  color: isLiquid ? '#000000' : '#FFFFFF',
                }}
                className="font-bold tracking-wide"
              >
                {isDistanceAlert && isBlinkAlert
                  ? 'Ergonomic & Blink Warning'
                  : isDistanceAlert
                  ? 'Screen Proximity Alert'
                  : 'Corneal Hydration Alert'}
              </span>
            </div>

            {/* Close Button */}
            <button
              type="button"
              data-no-drag="true"
              style={{
                width: `${Math.round(22 * scale)}px`,
                height: `${Math.round(22 * scale)}px`,
                backgroundColor: isLiquid ? 'rgba(0, 0, 0, 0.08)' : '#262626',
                border: isLiquid ? '1px solid rgba(0, 0, 0, 0.2)' : 'none',
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleCollapse();
              }}
              className={`flex items-center justify-center rounded-full transition cursor-pointer ${
                isLiquid ? 'text-black hover:bg-black/10' : 'text-neutral-300 hover:text-white hover:bg-white/30'
              }`}
              title="Close card"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke={isLiquid ? '#000000' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Interactive Directive */}
          <div className="my-auto flex flex-col items-center">
            <span
              style={{
                fontSize: `${Math.round(13 * scale)}px`,
                color: isLiquid ? '#000000' : '#FFFFFF',
              }}
              className="font-bold mb-0.5 text-center"
            >
              {isDistanceAlert && !isBlinkAlert
                ? 'Move away'
                : isDistanceAlert && isBlinkAlert
                ? `Move away | ${expandedBlinkHeadline}`
                : expandedBlinkHeadline}
            </span>

            <span
              style={{
                fontSize: `${Math.round(10.5 * scale)}px`,
                color: isLiquid ? '#111111' : '#D4D4D8',
              }}
              className="font-medium mb-1.5 text-center"
            >
              {isDistanceAlert && !isBlinkAlert
                ? `Current: ${displayDist} cm (Optimal: 40+ cm)`
                : blinksCompleted >= activeBlinkTarget || challengeJustCompleted
                ? 'Tear film restored! Good job.'
                : `Blink ${activeBlinkTarget === 1 ? 'once' : `${activeBlinkTarget} times`} deliberately:`}
            </span>

            {/* Dynamic Progress Indicator Pills */}
            {isBlinkAlert && (
              <div className="flex items-center gap-2">
                {Array.from({ length: activeBlinkTarget }).map((_, idx) => {
                  const isChecked = blinksCompleted > idx;
                  const isJustCompletedPill = challengeJustCompleted && idx === activeBlinkTarget - 1;
                  return (
                    <div
                      key={idx}
                      style={{
                        width: `${Math.round(38 * scale)}px`,
                        height: `${Math.round(24 * scale)}px`,
                        borderRadius: `${Math.round(12 * scale)}px`,
                        fontSize: `${Math.round(10.5 * scale)}px`,
                        border: isChecked
                          ? '1.5px solid #27C93F'
                          : isLiquid
                          ? '1.5px solid rgba(0, 0, 0, 0.40)'
                          : '1.5px solid rgba(255, 255, 255, 0.2)',
                        backgroundColor: isChecked
                          ? 'rgba(39, 201, 63, 0.35)'
                          : isLiquid
                          ? 'rgba(0, 0, 0, 0.08)'
                          : 'rgba(255, 255, 255, 0.05)',
                        color: isChecked ? '#27C93F' : isLiquid ? '#000000' : '#8E8E93',
                        boxShadow: isJustCompletedPill
                          ? '0 0 10px rgba(39, 201, 63, 0.8)'
                          : isLiquid && !isChecked
                          ? 'inset 0 1px 1px rgba(0, 0, 0, 0.15)'
                          : 'none',
                        transform: isJustCompletedPill ? 'scale(1.1)' : 'scale(1)',
                      }}
                      className="flex items-center justify-center font-bold transition-all duration-200"
                    >
                      {isChecked ? `✓ ${idx + 1}` : `${idx + 1}`}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Live Metrics Row & Open IRIS App link */}
          <div
            style={{
              paddingTop: `${Math.round(6 * scale)}px`,
              borderTop: isLiquid ? '1px solid rgba(0, 0, 0, 0.12)' : '1px solid rgba(255, 255, 255, 0.12)',
            }}
            className={`flex items-center justify-between ${isLiquid ? 'text-black' : 'text-neutral-400'}`}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: `${Math.round(10 * scale)}px`, color: isLiquid ? '#111111' : 'inherit' }}>Live Blink:</span>
              <AnimatedRollingNumber
                value={displayBlink}
                style={{
                  fontSize: `${Math.round(11 * scale)}px`,
                  color: isLiquid ? '#000000' : getBlinkRateColor(),
                  fontWeight: 700,
                }}
              />
              <span style={{ fontSize: `${Math.round(10 * scale)}px`, color: isLiquid ? '#111111' : 'inherit' }}>/m</span>
            </div>

            <button
              type="button"
              data-no-drag="true"
              style={{
                fontSize: `${Math.round(10 * scale)}px`,
              }}
              onClick={handleOpenIrisApp}
              className={`${isLiquid ? 'text-sky-700 hover:text-sky-900' : 'text-cyan-400 hover:text-cyan-300'} font-semibold underline underline-offset-2 transition cursor-pointer`}
            >
              Open Dashboard
            </button>

            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: `${Math.round(10 * scale)}px`, color: isLiquid ? '#111111' : 'inherit' }}>Distance:</span>
              <AnimatedRollingNumber
                value={displayDist}
                style={{
                  fontSize: `${Math.round(11 * scale)}px`,
                  color: isLiquid ? '#000000' : getDistanceColor(),
                  fontWeight: 700,
                }}
              />
              <span style={{ fontSize: `${Math.round(10 * scale)}px`, color: isLiquid ? '#111111' : 'inherit' }}>cm</span>
            </div>
          </div>
        </div>

        {/* ================= STAGE 3: MEGA MAXIMIZE CURVED FLOATING CARD ================= */}
        <div
          style={{
            opacity: currentState === 'mega' ? 1 : 0,
            transform: currentState === 'mega' ? 'scale(1)' : 'scale(0.92)',
            pointerEvents: currentState === 'mega' ? 'auto' : 'none',
            transition: 'opacity 320ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            width: '100%',
            height: '100%',
            padding: `${Math.round(36 * scale)}px`,
          }}
          className="absolute inset-0 flex flex-col justify-between select-none"
        >
          {/* Ambient subtle warning glow behind content */}
          <div
            className="absolute inset-0 pointer-events-none opacity-30 rounded-[56px]"
            style={{
              background:
                'radial-gradient(circle at 50% 40%, rgba(255, 60, 60, 0.35) 0%, rgba(255, 140, 0, 0.12) 50%, transparent 80%)',
            }}
          />

          {/* Top Row: IRIS Emblem + Badge + Dismiss Button */}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center">
                <img
                  src={IRIS_LOGO_WHITE_DATA_URL}
                  alt="IRIS"
                  style={{
                    width: `${Math.round(48 * scale)}px`,
                    height: `${Math.round(48 * scale)}px`,
                    objectFit: 'contain',
                    transform: 'scale(1.08)',
                    filter: isLiquid ? 'brightness(0)' : 'none',
                    padding: 0,
                  }}
                />
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_10px_#FF5F56]" />
              </div>
              <div className="flex flex-col items-start leading-tight">
                <span style={{ color: isLiquid ? '#000000' : '#FFFFFF' }} className="font-extrabold text-xs tracking-widest uppercase">
                  IRIS Pupil Priority Alert
                </span>
                <span style={{ color: isLiquid ? '#222222' : '#A3A3A3' }} className="text-[11px] font-medium">
                  Vision Health Protection System
                </span>
              </div>
            </div>

            <button
              type="button"
              data-no-drag="true"
              onClick={(e) => {
                e.stopPropagation();
                handleCollapse();
              }}
              style={{
                backgroundColor: isLiquid ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)',
                border: isLiquid ? '1px solid rgba(0, 0, 0, 0.35)' : '1px solid rgba(255, 255, 255, 0.15)',
                color: isLiquid ? '#000000' : '#FFFFFF',
              }}
              className="px-4 py-1.5 rounded-full hover:bg-white/30 text-xs font-semibold tracking-wide transition cursor-pointer backdrop-blur-md"
            >
              Dismiss Alert
            </button>
          </div>

          {/* Center Hero: Giant Bold Typography & Explanatory Text */}
          <div className="my-auto flex flex-col items-center text-center relative z-10 px-4">
            <h1
              style={{
                fontSize: 'clamp(36px, 4.6vw, 72px)',
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                color: isLiquid ? '#000000' : '#FFFFFF',
                textShadow: isLiquid
                  ? 'none'
                  : '0 4px 30px rgba(0, 0, 0, 0.8), 0 0 40px rgba(255, 80, 80, 0.35)',
              }}
              className="font-black mb-3 tracking-tight"
            >
              {isDistanceAlert && isBlinkAlert
                ? 'MOVE AWAY | BLINK'
                : isDistanceAlert
                ? 'MOVE AWAY'
                : activeBlinkTarget === 3
                ? 'BLINK THRICE'
                : activeBlinkTarget === 2
                ? 'BLINK TWICE'
                : 'BLINK ONCE'}
            </h1>

            <p
              style={{
                fontSize: 'clamp(14px, 1.4vw, 20px)',
                color: isLiquid ? '#111111' : '#E5E7EB',
                textShadow: isLiquid ? 'none' : 'none',
              }}
              className="font-semibold max-w-xl mb-6"
            >
              {isDistanceAlert && !isBlinkAlert
                ? `You are too close to the screen (${displayDist} cm). Move back to 40+ cm.`
                : blinksCompleted >= activeBlinkTarget || challengeJustCompleted
                ? 'Corneal tear film restored! Excellent job.'
                : 'Low blink rate detected over sustained observation. Complete deliberate blinks to refresh tear film:'}
            </p>

            {/* Giant Interactive Progress Indicators */}
            {isBlinkAlert && (
              <div className="flex items-center justify-center gap-4">
                {Array.from({ length: activeBlinkTarget }).map((_, idx) => {
                  const isChecked = blinksCompleted > idx;
                  const isJustDone = challengeJustCompleted && idx === activeBlinkTarget - 1;
                  return (
                    <div
                      key={idx}
                      style={{
                        width: 'clamp(56px, 5vw, 72px)',
                        height: 'clamp(44px, 4vw, 56px)',
                        borderRadius: '28px',
                        fontSize: 'clamp(18px, 1.8vw, 26px)',
                        border: isChecked
                          ? '2.5px solid #27C93F'
                          : isLiquid
                          ? '2px solid rgba(0, 0, 0, 0.40)'
                          : '2px solid rgba(255, 255, 255, 0.22)',
                        backgroundColor: isChecked
                          ? 'rgba(39, 201, 63, 0.35)'
                          : isLiquid
                          ? 'rgba(0, 0, 0, 0.08)'
                          : 'rgba(255, 255, 255, 0.06)',
                        color: isChecked ? '#27C93F' : isLiquid ? '#000000' : '#99999F',
                        boxShadow: isChecked
                          ? '0 0 20px rgba(39, 201, 63, 0.75)'
                          : isLiquid && !isChecked
                          ? 'inset 0 1px 1.5px rgba(0, 0, 0, 0.15)'
                          : 'none',
                        transform: isJustDone ? 'scale(1.15)' : 'scale(1)',
                        transition: 'all 240ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                      className="flex items-center justify-center font-black"
                    >
                      {isChecked ? `✓ ${idx + 1}` : `${idx + 1}`}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Live Metrics & Dashboard Navigation */}
          <div
            style={{
              paddingTop: `${Math.round(14 * scale)}px`,
              borderTop: isLiquid ? '1px solid rgba(0, 0, 0, 0.12)' : '1px solid rgba(255, 255, 255, 0.12)',
            }}
            className={`flex items-center justify-between relative z-10 px-2 ${isLiquid ? 'text-black' : 'text-neutral-400'}`}
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: `${Math.round(12 * scale)}px`, color: isLiquid ? '#111111' : 'inherit' }}>Live Blink Rate:</span>
              <AnimatedRollingNumber
                value={displayBlink}
                style={{
                  fontSize: `${Math.round(14 * scale)}px`,
                  color: isLiquid ? '#000000' : getBlinkRateColor(),
                  fontWeight: 700,
                }}
              />
              <span style={{ fontSize: `${Math.round(12 * scale)}px`, color: isLiquid ? '#111111' : 'inherit' }}>/min</span>
            </div>

            <button
              type="button"
              data-no-drag="true"
              style={{ fontSize: `${Math.round(12 * scale)}px` }}
              onClick={handleOpenIrisApp}
              className={`${isLiquid ? 'text-sky-700 hover:text-sky-900' : 'text-cyan-400 hover:text-cyan-300'} font-bold underline underline-offset-4 transition cursor-pointer`}
            >
              Open IRIS Dashboard
            </button>

            <div className="flex items-center gap-2">
              <span style={{ fontSize: `${Math.round(12 * scale)}px`, color: isLiquid ? '#111111' : 'inherit' }}>Screen Distance:</span>
              <AnimatedRollingNumber
                value={displayDist}
                style={{
                  fontSize: `${Math.round(14 * scale)}px`,
                  color: isLiquid ? '#000000' : getDistanceColor(),
                  fontWeight: 700,
                }}
              />
              <span style={{ fontSize: `${Math.round(12 * scale)}px`, color: isLiquid ? '#111111' : 'inherit' }}>cm</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IrisFloatingWidget;
