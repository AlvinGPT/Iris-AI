import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Activity,
  Check,
  Play,
  Pause,
} from 'lucide-react';
import { TelemetryState } from '../types';
import { computeBlinkThresholds, DEFAULT_BLINK_CONFIG } from '../services/blinkDetector';
import { AnimatedNumber } from './ui/AnimatedNumber';

interface BlinkDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: TelemetryState;
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  rawLandmarks?: any;
  videoElement?: HTMLVideoElement | null;
}

interface TestItem {
  id: string;
  name: string;
  desc: string;
  expectedResult: string;
  observedCount: number;
  detectedCount: number;
  status: 'pending' | 'running' | 'passed' | 'failed';
}

interface GraphPoint {
  timestamp: number;
  ear: number;
  closure: number;
  isBlink: boolean;
  type?: string;
  isReliable: boolean;
}

export const BlinkDebugModal: React.FC<BlinkDebugModalProps> = ({
  isOpen,
  onClose,
  telemetry,
  isMonitoring,
  onToggleMonitoring,
}) => {
  const [activeTab, setActiveTab] = useState<'live' | 'tests'>('live');
  const graphCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<GraphPoint[]>([]);
  const prevTotalBlinksRef = useRef<number>(telemetry.totalBlinksDetected);

  // Shared live threshold configuration from the detector
  const sharedThresholds = computeBlinkThresholds(
    telemetry.baselineAperture || DEFAULT_BLINK_CONFIG.defaultBaselineEAR,
    DEFAULT_BLINK_CONFIG
  );
  const liveBaselineEAR = telemetry.baselineAperture ?? sharedThresholds.baselineEAR;
  const liveClosureThresholdEAR =
    telemetry.closureThresholdEAR ?? sharedThresholds.closureThresholdEAR;
  const liveReopenThresholdEAR =
    telemetry.reopenThresholdEAR ?? sharedThresholds.reopenThresholdEAR;

  const thresholdsRef = useRef({
    baselineEAR: liveBaselineEAR,
    closureThresholdEAR: liveClosureThresholdEAR,
    reopenThresholdEAR: liveReopenThresholdEAR,
  });
  thresholdsRef.current = {
    baselineEAR: liveBaselineEAR,
    closureThresholdEAR: liveClosureThresholdEAR,
    reopenThresholdEAR: liveReopenThresholdEAR,
  };

  // 15 Test Requirements from Specification (A through O)
  const [tests, setTests] = useState<TestItem[]>([
    { id: 'A', name: 'A. Normal Blinking', desc: 'Blink naturally at a relaxed pace (1-2 blinks every 5 seconds).', expectedResult: 'Each complete blink increments count by 1.', observedCount: 5, detectedCount: 0, status: 'pending' },
    { id: 'B', name: 'B. Fast Blinking', desc: 'Blink rapidly (quick spontaneous flutter 80-120ms duration).', expectedResult: 'Fast micro-movements detected without drops.', observedCount: 5, detectedCount: 0, status: 'pending' },
    { id: 'C', name: 'C. Slow Blinking', desc: 'Blink deliberately slow with extended descent (300-450ms).', expectedResult: 'Recognized as single valid blink upon reopening.', observedCount: 3, detectedCount: 0, status: 'pending' },
    { id: 'D', name: 'D. Partial Blinking', desc: 'Half-blink / incomplete closure (16-21% drop from baseline).', expectedResult: 'Categorized as Partial Blink without dropping.', observedCount: 4, detectedCount: 0, status: 'pending' },
    { id: 'E', name: 'E. Wearing Glasses', desc: 'Blink with standard eyeglasses, frames or minor reflections.', expectedResult: 'No tracking degradation or false triggers.', observedCount: 5, detectedCount: 0, status: 'pending' },
    { id: 'F', name: 'F. Looking Left/Right', desc: 'Shift gaze laterally without closing eyelids.', expectedResult: 'Zero false blinks recorded.', observedCount: 0, detectedCount: 0, status: 'pending' },
    { id: 'G', name: 'G. Looking Up/Down', desc: 'Tilt eyes down towards keyboard or up at ceiling.', expectedResult: 'Pitch compensation prevents false triggers.', observedCount: 0, detectedCount: 0, status: 'pending' },
    { id: 'H', name: 'H. Head Tilt', desc: 'Tilt head sideways left and right (Roll 15-25 deg).', expectedResult: 'Geometry maintains accurate aperture.', observedCount: 3, detectedCount: 0, status: 'pending' },
    { id: 'I', name: 'I. Moving Closer/Farther', desc: 'Lean forward to 35cm, then lean back to 70cm.', expectedResult: 'Normalized EAR remains scale-invariant.', observedCount: 4, detectedCount: 0, status: 'pending' },
    { id: 'J', name: 'J. Different Lighting', desc: 'Introduce shadow or dim light from one side.', expectedResult: 'Adaptive baseline maintains detection.', observedCount: 4, detectedCount: 0, status: 'pending' },
    { id: 'K', name: 'K. Temporary Face Loss', desc: 'Cover face with hands for 3 seconds, then reveal.', expectedResult: 'Observation marked unobserved, no fake blinks.', observedCount: 0, detectedCount: 0, status: 'pending' },
    { id: 'L', name: 'L. Camera Frame Drops', desc: 'Simulate CPU load or frame stutter.', expectedResult: 'Time-aware state machine rejects spikes.', observedCount: 3, detectedCount: 0, status: 'pending' },
    { id: 'M', name: 'M. Long Eye Closure', desc: 'Close eyes and keep them closed for 3 full seconds.', expectedResult: 'Classified as Prolonged Closure; NOT multiple blinks.', observedCount: 0, detectedCount: 0, status: 'pending' },
    { id: 'N', name: 'N. Extended Stare (No Blinking)', desc: 'Keep eyes open without blinking for 15-20 seconds.', expectedResult: 'Zero blinks incremented, BPM drops realistically.', observedCount: 0, detectedCount: 0, status: 'pending' },
    { id: 'O', name: 'O. Rapid Repeated Blinking', desc: 'Blink 3 times in rapid succession (150ms apart).', expectedResult: 'Accurately counts exactly 3 distinct blinks.', observedCount: 3, detectedCount: 0, status: 'pending' },
  ]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Record real camera measurements in rolling history for real-time oscillogram
  useEffect(() => {
    if (!isOpen || !isMonitoring || !telemetry.faceDetected) {
      prevTotalBlinksRef.current = telemetry.totalBlinksDetected;
      return;
    }

    const now = performance.now();
    const isNewBlink = telemetry.totalBlinksDetected > prevTotalBlinksRef.current;
    prevTotalBlinksRef.current = telemetry.totalBlinksDetected;

    const measuredEAR =
      typeof telemetry.combinedAperture === 'number' && telemetry.combinedAperture > 0
        ? telemetry.combinedAperture
        : typeof telemetry.leftEyeAperture === 'number' && typeof telemetry.rightEyeAperture === 'number'
        ? (telemetry.leftEyeAperture + telemetry.rightEyeAperture) / 2
        : liveBaselineEAR;

    historyRef.current.push({
      timestamp: now,
      ear: measuredEAR,
      closure: telemetry.eyeClosureScore || 0,
      isBlink: isNewBlink,
      type: telemetry.lastBlinkType,
      isReliable: telemetry.isReliable !== false,
    });

    if (historyRef.current.length > 180) {
      historyRef.current.shift();
    }
  }, [
    isOpen,
    isMonitoring,
    telemetry.faceDetected,
    telemetry.combinedAperture,
    telemetry.leftEyeAperture,
    telemetry.rightEyeAperture,
    telemetry.eyeClosureScore,
    telemetry.totalBlinksDetected,
    telemetry.lastBlinkType,
    telemetry.isReliable,
    liveBaselineEAR,
  ]);

  // Render Real-time Oscillogram Graph using the exact shared threshold configuration
  useEffect(() => {
    if (!isOpen) return;
    const canvas = graphCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Unified Y-axis mapping for both threshold lines and live EAR signal
    const maxDisplayEAR = 0.42;
    const earToY = (earVal: number, h: number): number => {
      const clamped = Math.max(0, Math.min(maxDisplayEAR, earVal));
      return h - (clamped / maxDisplayEAR) * (h - 24) - 12;
    };

    let animId: number;
    const renderGraph = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      const { baselineEAR, closureThresholdEAR, reopenThresholdEAR } = thresholdsRef.current;

      // 1. Open Baseline Line
      const baselineY = earToY(baselineEAR, h);
      ctx.strokeStyle = '#398BFF';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(0, baselineY);
      ctx.lineTo(w, baselineY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#398BFF';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`BASELINE OPEN (${baselineEAR.toFixed(3)})`, 8, Math.max(12, baselineY - 5));

      // 2. Hysteresis Reopen Threshold Line (subtle band between closure & reopen)
      const reopenY = earToY(reopenThresholdEAR, h);
      const closureY = earToY(closureThresholdEAR, h);

      // Subtle shaded hysteresis band between Reopen and Closure thresholds
      ctx.fillStyle = 'rgba(255, 133, 27, 0.08)';
      ctx.fillRect(0, Math.min(reopenY, closureY), w, Math.abs(closureY - reopenY));

      ctx.strokeStyle = 'rgba(37, 214, 193, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, reopenY);
      ctx.lineTo(w, reopenY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(37, 214, 193, 0.85)';
      ctx.font = 'bold 9.5px monospace';
      ctx.fillText(`REOPEN HYSTERESIS (${reopenThresholdEAR.toFixed(3)})`, w - 210, Math.max(12, reopenY - 4));

      // 3. Calibrated Closure Threshold Line (matches detector's actual closureThresholdEAR)
      ctx.strokeStyle = '#FF851B';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, closureY);
      ctx.lineTo(w, closureY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#FF851B';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(
        `CALIBRATED CLOSURE THRESHOLD (${closureThresholdEAR.toFixed(3)})`,
        8,
        Math.min(h - 6, closureY + 13)
      );

      // 4. Real-time Eyelid Aperture Signal Trace
      const history = historyRef.current;
      if (history.length > 1) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        const step = w / 180;
        for (let i = 0; i < history.length; i++) {
          const pt = history[i];
          const x = i * step;
          const y = earToY(pt.ear, h);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Draw verified blink event markers
        for (let i = 0; i < history.length; i++) {
          if (history[i].isBlink) {
            const x = i * step;
            ctx.strokeStyle = '#FF851B';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();

            ctx.fillStyle = '#FF851B';
            ctx.beginPath();
            ctx.arc(x, 15, 4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText(history[i].type === 'Partial' ? 'PARTIAL' : 'BLINK', x + 5, 18);
          }
        }
      }

      animId = requestAnimationFrame(renderGraph);
    };

    renderGraph();
    return () => cancelAnimationFrame(animId);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[95vh] overflow-y-auto glass-modal p-5 sm:p-6 flex flex-col gap-5 text-black dark:text-white animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b-2 border-black dark:border-[#F5F5F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#55C7F2] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex items-center justify-center text-[#0D0D0D]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-dm text-lg sm:text-xl font-extrabold text-black dark:text-[#F5F5F0]">
                  Blink Audit
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-dm uppercase font-extrabold bg-[#FFD84D] dark:bg-[#D4FF3F] text-[#0D0D0D] border border-black">
                  LIVE SENSOR
                </span>
              </div>
              <p className="text-xs font-semibold text-black/75 dark:text-[#D4D4CE] font-dm">
                Real-time blink detection and test checks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-white dark:bg-[#262626] rounded-full p-1 border-2 border-black dark:border-[#F5F5F0]">
              <button
                type="button"
                onClick={() => setActiveTab('live')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                  activeTab === 'live'
                    ? 'bg-[#FF851B] dark:bg-[var(--vivid-accent,#D4FF3F)] text-black dark:text-[var(--vivid-accent-fg,#0D0D0D)] border border-black'
                    : 'text-black dark:text-[#F5F5F0] hover:bg-black/10 dark:hover:bg-white/15'
                }`}
              >
                Live Readings
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tests')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                  activeTab === 'tests'
                    ? 'bg-[#FF851B] dark:bg-[var(--vivid-accent,#D4FF3F)] text-black dark:text-[var(--vivid-accent-fg,#0D0D0D)] border border-black'
                    : 'text-black dark:text-[#F5F5F0] hover:bg-black/10 dark:hover:bg-white/15'
                }`}
              >
                Tests
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white hover:bg-[#FF851B] dark:bg-[#262626] dark:hover:bg-[#FF8A1F] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex items-center justify-center text-black dark:text-[#F5F5F0] dark:hover:text-[#0D0D0D] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeTab === 'live' ? (
          <>
            {/* Live Real-time Oscillogram */}
            <div className="flex flex-col gap-2 p-4 rounded-2xl bg-white dark:bg-[#242424] border-2 border-black dark:border-[#F5F5F0] shadow-[3px_3px_0px_#000000] dark:shadow-[3px_3px_0px_#F5F5F0]">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#25D6C1] dark:bg-[#D4FF3F] border border-black animate-pulse" />
                  <span className="text-xs font-dm uppercase font-extrabold tracking-wider text-black dark:text-[#F5F5F0]">
                    Eyelid signal over time
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-extrabold tabular-nums">
                  <span className="text-black dark:text-[#D4FF3F]">
                    Average:{' '}
                    {telemetry.avgBlinkRate !== null ? (
                      <AnimatedNumber value={telemetry.avgBlinkRate} suffix=" BPM" />
                    ) : (
                      'Collecting...'
                    )}
                  </span>
                  <span className="text-black/40 dark:text-white/40">|</span>
                  <span className="text-black dark:text-[#25D6C1]">
                    Last minute:{' '}
                    {telemetry.rollingBlinkRate !== undefined && telemetry.rollingBlinkRate !== null ? (
                      <AnimatedNumber value={telemetry.rollingBlinkRate} suffix=" BPM" />
                    ) : (
                      '--'
                    )}
                  </span>
                  <span className="text-black/40 dark:text-white/40">|</span>
                  <span className="text-[#FF851B] dark:text-[#FF8A1F]">
                    Blinks: <AnimatedNumber value={telemetry.totalBlinksDetected} />
                  </span>
                </div>
              </div>

              {/* Canvas Oscillogram */}
              <div className="w-full h-44 rounded-xl overflow-hidden border-2 border-black dark:border-[#F5F5F0] bg-[#050505]">
                <canvas
                  ref={graphCanvasRef}
                  width={900}
                  height={176}
                  className="w-full h-full block"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] font-bold text-black/75 dark:text-[#D4D4CE] pt-1 gap-2">
                <span>
                  Baseline: <strong className="tabular-nums">{liveBaselineEAR.toFixed(3)}</strong> · Reopen:{' '}
                  <strong className="tabular-nums">{liveReopenThresholdEAR.toFixed(3)}</strong> · Closure (16% drop):{' '}
                  <strong className="tabular-nums text-[#FF851B] dark:text-[#FF8A1F]">{liveClosureThresholdEAR.toFixed(3)}</strong>
                </span>
                <span>Vertical Axis: Eye opening</span>
                <span className="text-[#FF851B] dark:text-[#FF8A1F] font-extrabold">
                  Orange markers indicate blinks
                </span>
              </div>
            </div>

            {/* Diagnostic Metrics Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {/* Left Eye Opening */}
              <div className="p-3.5 rounded-2xl bg-[#55C7F2] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex flex-col justify-between">
                <span className="text-[10px] font-dm uppercase font-extrabold text-[#0D0D0D]">
                  Left Eye Aperture (EAR)
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-dm text-2xl font-extrabold text-[#0D0D0D] tabular-nums">
                    {telemetry.leftEyeAperture ? telemetry.leftEyeAperture.toFixed(3) : '--'}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-[#0D0D0D]/80 mt-1 tabular-nums">
                  Close ≤ {liveClosureThresholdEAR.toFixed(3)}
                </span>
              </div>

              {/* Right Eye Opening */}
              <div className="p-3.5 rounded-2xl bg-[#25D6C1] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex flex-col justify-between">
                <span className="text-[10px] font-dm uppercase font-extrabold text-[#0D0D0D]">
                  Right Eye Aperture (EAR)
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="font-dm text-2xl font-extrabold text-[#0D0D0D] tabular-nums">
                    {telemetry.rightEyeAperture ? telemetry.rightEyeAperture.toFixed(3) : '--'}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-[#0D0D0D]/80 mt-1 tabular-nums">
                  Reopen ≥ {liveReopenThresholdEAR.toFixed(3)}
                </span>
              </div>

              {/* State Machine State */}
              <div className="p-3.5 rounded-2xl bg-[#FFD84D] dark:bg-[#D4FF3F] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex flex-col justify-between">
                <span className="text-[10px] font-dm uppercase font-extrabold text-[#0D0D0D]">
                  State Machine
                </span>
                <div className="mt-1">
                  <span className="inline-block px-2.5 py-1 rounded-full text-xs font-extrabold uppercase font-dm bg-white dark:bg-[#F7F5EE] text-[#0D0D0D] border-2 border-black">
                    {telemetry.blinkState || 'OPEN'}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-[#0D0D0D]/80 mt-1">
                  Blink detector state
                </span>
              </div>

              {/* Last Blink Details */}
              <div className="p-3.5 rounded-2xl bg-[#C77DFF] dark:bg-[#B968F0] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex flex-col justify-between">
                <span className="text-[10px] font-dm uppercase font-extrabold text-[#0D0D0D]">
                  Last Validated Event
                </span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="font-dm text-2xl font-extrabold text-[#0D0D0D] tabular-nums">
                    {telemetry.lastBlinkDurationMs ? `${telemetry.lastBlinkDurationMs}ms` : '--'}
                  </span>
                  <span className="text-[11px] text-[#0D0D0D]/85 font-extrabold">
                    ({telemetry.lastBlinkType || 'Full'})
                  </span>
                </div>
                <span className="text-[10px] font-bold text-[#0D0D0D]/80 mt-1 tabular-nums">
                  Confidence: {Math.round((telemetry.blinkConfidence || 0.95) * 100)}%
                </span>
              </div>
            </div>

            {/* Breakdown & Telemetry Integrity Card */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white dark:bg-[#242424] border-2 border-black dark:border-[#F5F5F0] flex items-center justify-between">
                <span className="font-bold text-black/80 dark:text-[#D4D4CE]">Full / Complete:</span>
                <AnimatedNumber
                  value={telemetry.fullBlinksDetected || 0}
                  className="font-extrabold text-black dark:text-[#F5F5F0] text-sm"
                />
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#242424] border-2 border-black dark:border-[#F5F5F0] flex items-center justify-between">
                <span className="font-bold text-black/80 dark:text-[#D4D4CE]">Partial / Shallow:</span>
                <AnimatedNumber
                  value={telemetry.partialBlinksDetected || 0}
                  className="font-extrabold text-black dark:text-[#FF8A1F] text-sm"
                />
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#242424] border-2 border-black dark:border-[#F5F5F0] flex items-center justify-between">
                <span className="font-bold text-black/80 dark:text-[#D4D4CE]">Observed Time:</span>
                <span className="font-extrabold text-black dark:text-[#D4FF3F] text-sm tabular-nums">
                  {Math.floor(telemetry.observationSeconds / 60)}m{' '}
                  {Math.round(telemetry.observationSeconds % 60)}s
                </span>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#242424] border-2 border-black dark:border-[#F5F5F0] flex items-center justify-between">
                <span className="font-bold text-black/80 dark:text-[#D4D4CE]">Tracking Coverage:</span>
                <span className="font-extrabold text-black dark:text-[#25D6C1] text-sm tabular-nums">
                  {telemetry.trackingCoveragePct !== undefined ? `${telemetry.trackingCoveragePct}%` : '100%'}
                </span>
              </div>
            </div>

            {/* Candidate Event Diagnostic Log */}
            {telemetry.candidateLogs && telemetry.candidateLogs.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#242424] border-2 border-black dark:border-[#F5F5F0] flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-dm uppercase font-extrabold tracking-wider text-black dark:text-[#F5F5F0]">
                    Recent Candidate Eyelid Closure Events (Accepted &amp; Rejected Reasons)
                  </span>
                  <span className="text-[10px] font-bold text-black/60 dark:text-[#A3A39E] tabular-nums">
                    Showing latest {Math.min(5, telemetry.candidateLogs.length)} events
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {telemetry.candidateLogs.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-black/20 dark:border-white/20 bg-black/[0.02] dark:bg-white/[0.03] tabular-nums"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            item.outcome === 'ACCEPTED'
                              ? 'bg-[#25D6C1] text-[#0D0D0D] border border-black'
                              : 'bg-[#FF851B]/30 text-black dark:text-[#FF8A1F] border border-black/40'
                          }`}
                        >
                          {item.outcome}
                        </span>
                        <span className="font-semibold text-black dark:text-[#F5F5F0]">{item.reason}</span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-black/75 dark:text-[#D4D4CE]">
                        Drop: {item.dropPct}% · Min EAR: {item.minEAR} · Duration: {item.durationMs}ms
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Head Pose & Eyeglass Tracking Quality */}
            <div className="p-3.5 rounded-2xl bg-[#FF851B] dark:bg-[#FF8A1F] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex flex-wrap items-center justify-between gap-3 text-xs text-[#0D0D0D]">
              <div className="flex items-center gap-2 font-bold">
                <span>Head position:</span>
                <span className="font-mono font-extrabold bg-white dark:bg-[#F7F5EE] px-2 py-0.5 rounded border-2 border-black text-[#0D0D0D] tabular-nums">
                  Yaw: {telemetry.headPose?.yaw ?? 0}° | Pitch: {telemetry.headPose?.pitch ?? 0}° | Roll: {telemetry.headPose?.roll ?? 0}°
                </span>
              </div>

              <div className="flex items-center gap-2 font-bold">
                <span>Tracking status:</span>
                <span className="px-2.5 py-0.5 rounded-full font-extrabold uppercase text-[10px] bg-white dark:bg-[#F7F5EE] text-[#0D0D0D] border-2 border-black">
                  {telemetry.trackingQuality} ({telemetry.isReliable !== false ? 'Reliable' : 'Unreliable — Paused'})
                </span>
              </div>
            </div>
          </>
        ) : (
          /* 15-Test Verification Suite */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FFD84D] dark:bg-[#D4FF3F] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0]">
              <div>
                <h3 className="font-extrabold text-sm text-[#0D0D0D]">
                  Verification Checklist
                </h3>
                <p className="text-xs font-semibold text-[#0D0D0D]/80">
                  Verify blinks under different conditions.
                </p>
              </div>

              <span className="text-xs font-extrabold text-[#0D0D0D] bg-white dark:bg-[#F7F5EE] px-3 py-1 rounded-full border-2 border-black tabular-nums">
                Current Count: <AnimatedNumber value={telemetry.totalBlinksDetected} /> Blinks
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {tests.map((test, idx) => (
                <div
                  key={test.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#242424] border-2 border-black dark:border-[#F5F5F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-black dark:text-[#D4FF3F] text-sm font-dm">{test.name}</span>
                      <span className="text-[10px] font-bold text-black/70 dark:text-[#D4D4CE] uppercase font-dm">
                        Expected: {test.expectedResult}
                      </span>
                    </div>
                    <p className="text-black/85 dark:text-[#F5F5F0] font-medium text-[11.5px] mt-0.5">{test.desc}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 font-mono text-xs bg-[#FFF8ED] dark:bg-[#141414] px-2.5 py-1.5 rounded-xl border-2 border-black dark:border-[#F5F5F0] tabular-nums">
                      <span className="font-bold text-black/75 dark:text-[#D4D4CE]">Target:</span>
                      <span className="font-extrabold text-black dark:text-[#F5F5F0]">{test.observedCount}</span>
                      <span className="text-black/40 dark:text-white/40">|</span>
                      <span className="font-bold text-black/75 dark:text-[#D4D4CE]">System:</span>
                      <span className="font-extrabold text-[#FF851B] dark:text-[#D4FF3F]">
                        <AnimatedNumber value={telemetry.totalBlinksDetected} />
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setTests((prev) =>
                          prev.map((t, i) =>
                            i === idx
                              ? {
                                  ...t,
                                  status: t.status === 'passed' ? 'pending' : 'passed',
                                }
                              : t
                          )
                        );
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-extrabold border-2 border-black dark:border-[#F5F5F0] transition-all cursor-pointer flex items-center gap-1.5 ${
                        test.status === 'passed'
                          ? 'bg-[#25D6C1] text-[#0D0D0D]'
                          : 'bg-[#FFF8ED] dark:bg-[#141414] text-black dark:text-[#F5F5F0] hover:bg-[#FFD84D] dark:hover:bg-[#D4FF3F] dark:hover:text-[#0D0D0D]'
                      }`}
                    >
                      {test.status === 'passed' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Verified</span>
                        </>
                      ) : (
                        <span>Verify Condition</span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer controls */}
        <div className="flex items-center justify-between pt-3 border-t-2 border-black dark:border-white text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMonitoring}
              className="btn-pill-secondary py-1.5 px-4 text-xs"
            >
              {isMonitoring ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Sensor</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Sensor</span>
                </>
              )}
            </button>
            <span className="font-bold text-black/80 dark:text-white/80">
              Webcam: {isMonitoring ? 'Active (Real Data)' : 'Standby'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-pill-primary py-2 px-5 text-xs"
          >
            Close Debug Mode
          </button>
        </div>
      </div>
    </div>
  );
};
