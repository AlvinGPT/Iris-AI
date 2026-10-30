import React, { useState, useEffect } from 'react';
import {
  Ruler,
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Info,
  Play,
} from 'lucide-react';
import { TelemetryState } from '../types';

interface DistanceCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: TelemetryState;
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  onCalibrate: (distanceCm: number) => boolean;
  onResetCalibration: () => void;
  initialReferenceDistance?: number;
}

export const DistanceCalibrationModal: React.FC<DistanceCalibrationModalProps> = ({
  isOpen,
  onClose,
  telemetry,
  isMonitoring,
  onToggleMonitoring,
  onCalibrate,
  onResetCalibration,
  initialReferenceDistance = 50,
}) => {
  const [selectedDistance, setSelectedDistance] = useState<number>(() => {
    return telemetry.avgScreenDistance || initialReferenceDistance || 50;
  });
  const [calibrationSuccess, setCalibrationSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (telemetry.avgScreenDistance) {
        setSelectedDistance(telemetry.avgScreenDistance);
      }
      setCalibrationSuccess(null);
      setErrorMessage(null);
    }
  }, [isOpen, telemetry.avgScreenDistance]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const presets = [
    { cm: 40, label: '40 cm', desc: 'Laptop Display' },
    { cm: 50, label: '50 cm', desc: "Arm's Length (Optimal)", recommended: true },
    { cm: 60, label: '60 cm', desc: 'Desktop Monitor' },
    { cm: 70, label: '70 cm', desc: 'Deep Desk / Ultrawide' },
  ];

  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.36);
    } catch {
      // Ignore audio errors
    }
  };

  const handleExecuteCalibration = () => {
    setErrorMessage(null);
    setCalibrationSuccess(null);

    const ok = onCalibrate(selectedDistance);
    if (ok) {
      playChime();
      if (isMonitoring && telemetry.faceDetected) {
        setCalibrationSuccess(`Calibrated at ${selectedDistance} cm.`);
      } else {
        setCalibrationSuccess(`Distance set to ${selectedDistance} cm.`);
      }
    } else {
      setErrorMessage('Please select a distance between 25 cm and 120 cm.');
    }
  };

  const handleReset = () => {
    onResetCalibration();
    setSelectedDistance(50);
    setCalibrationSuccess('Distance reset to 50 cm.');
    setErrorMessage(null);
  };

  const currentDist = telemetry.screenDistanceCm ?? telemetry.avgScreenDistance;
  const distZoneColor =
    currentDist !== null && currentDist < 38
      ? 'bg-[#FF851B] text-[#0D0D0D] border-black'
      : 'bg-[#25D6C1] text-[#0D0D0D] border-black';

  const distZoneLabel =
    currentDist === null
      ? 'Uncalibrated'
      : currentDist < 38
      ? 'Too Close (<38cm)'
      : currentDist <= 75
      ? 'Comfortable Range (38–75 cm)'
      : 'Far Viewing (>75cm)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="distance-calibration-title"
    >
      <div className="w-full max-w-lg glass-modal rounded-[28px] p-6 sm:p-7 flex flex-col gap-5 max-h-[92vh] overflow-y-auto text-black dark:text-[#F5F5F0] font-dm">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[#25D6C1] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex items-center justify-center text-[#0D0D0D] shrink-0">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="distance-calibration-title"
                  className="font-cormorant text-2xl font-bold text-black dark:text-[#F5F5F0] tracking-tight"
                >
                  Screen Distance Calibration
                </h2>
                {telemetry.isCalibrated && (
                  <span className="pill-badge text-[10px]">
                    <Sparkles className="w-2.5 h-2.5" /> Calibrated
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-black/75 dark:text-[#D4D4CE] mt-0.5">
                Set your current screen distance as your baseline.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calibration modal"
            className="w-9 h-9 rounded-full bg-white hover:bg-[#FF851B] dark:bg-[#262626] dark:hover:bg-[#FF8A1F] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] flex items-center justify-center text-black dark:text-[#F5F5F0] dark:hover:text-[#0D0D0D] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Banner */}
        {calibrationSuccess && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-[20px] bg-[#25D6C1] border-2 border-black dark:border-[#F5F5F0] shadow-[3px_3px_0px_#000000] dark:shadow-[3px_3px_0px_#F5F5F0] text-[#0D0D0D] text-xs">
            <CheckCircle2 className="w-4 h-4 text-[#0D0D0D] mt-0.5 shrink-0" />
            <span className="leading-relaxed font-extrabold">{calibrationSuccess}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-[20px] bg-[#FF851B] border-2 border-black dark:border-[#F5F5F0] shadow-[3px_3px_0px_#000000] dark:shadow-[3px_3px_0px_#F5F5F0] text-[#0D0D0D] text-xs">
            <AlertCircle className="w-4 h-4 text-[#0D0D0D] mt-0.5 shrink-0" />
            <span className="leading-relaxed font-extrabold">{errorMessage}</span>
          </div>
        )}

        {/* Live Telemetry Readout Card */}
        <div className="p-4 rounded-[20px] bg-[#55C7F2] border-2 border-black dark:border-[#F5F5F0] shadow-[3px_3px_0px_#000000] dark:shadow-[3px_3px_0px_#F5F5F0] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-[#0D0D0D]" />
              <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#0D0D0D]">
                Camera Status
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border-2 border-black ${
                  isMonitoring && telemetry.faceDetected
                    ? 'bg-[#25D6C1] text-[#0D0D0D]'
                    : isMonitoring
                    ? 'bg-[#FF851B] text-[#0D0D0D]'
                    : 'bg-white dark:bg-[#F7F5EE] text-[#0D0D0D]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full border border-black ${
                    isMonitoring && telemetry.faceDetected
                      ? 'bg-white animate-pulse'
                      : isMonitoring
                      ? 'bg-black animate-ping'
                      : 'bg-black/40'
                  }`}
                />
                {isMonitoring && telemetry.faceDetected
                  ? 'Face Detected'
                  : isMonitoring
                  ? 'Looking for face...'
                  : 'Camera Off'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="p-3 rounded-[16px] bg-white dark:bg-[#F7F5EE] border-2 border-black flex flex-col">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.05em] text-black/75">
                Live Distance
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-extrabold text-[#0D0D0D] tabular-nums">
                  {currentDist ?? '--'}
                </span>
                <span className="text-xs font-extrabold text-black/75">cm</span>
              </div>
              <span className={`mt-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border w-fit ${distZoneColor}`}>
                {distZoneLabel}
              </span>
            </div>

            <div className="p-3 rounded-[16px] bg-white dark:bg-[#F7F5EE] border-2 border-black flex flex-col">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.05em] text-black/75">
                Eye span
              </span>
              <span className="text-lg font-extrabold text-[#0D0D0D] mt-0.5 tabular-nums">
                {telemetry.faceDetected && telemetry.interOcularRatio
                  ? telemetry.interOcularRatio.toFixed(4)
                  : '—'}
              </span>
              <span className="text-[10px] font-semibold text-black/70 mt-auto">
                Relative measurement
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-[16px] bg-white dark:bg-[#F7F5EE] border-2 border-black flex flex-col">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.05em] text-black/75">
                Face width
              </span>
              <span className="text-lg font-extrabold text-[#0D0D0D] mt-0.5 tabular-nums">
                {telemetry.faceDetected && telemetry.faceWidthRatio
                  ? telemetry.faceWidthRatio.toFixed(4)
                  : '—'}
              </span>
              <span className="text-[10px] font-semibold text-black/70 mt-auto">
                Relative measurement
              </span>
            </div>
          </div>

          {!isMonitoring && (
            <button
              type="button"
              onClick={onToggleMonitoring}
              className="w-full py-2.5 px-4 pill-primary text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Turn on camera to calibrate</span>
            </button>
          )}

          {isMonitoring && !telemetry.faceDetected && (
            <p className="text-[11px] font-bold text-[#0D0D0D] bg-[#FFD84D] dark:bg-[#D4FF3F] p-2.5 rounded-[14px] border-2 border-black">
              Face the camera and ensure good lighting to calibrate.
            </p>
          )}
        </div>

        {/* The Arm's Length Rule Educational Callout */}
        <div className="flex items-start gap-3 p-3.5 rounded-[20px] bg-[#FFD84D] dark:bg-[#D4FF3F] border-2 border-black dark:border-[#F5F5F0] shadow-[2px_2px_0px_#000000] dark:shadow-[2px_2px_0px_#F5F5F0] text-xs text-[#0D0D0D]">
          <Info className="w-4 h-4 text-[#0D0D0D] mt-0.5 shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="font-extrabold">
              The &quot;Arm&apos;s Length&quot; Guide:
            </span>
            <p className="text-[11.5px] font-medium leading-relaxed text-[#0D0D0D]/90">
              Sit back comfortably in your normal work posture. Extend your arm straight forward towards the screen — your fingertips should lightly touch or sit just shy of the glass (typically <strong>50 to 55 cm</strong>).
            </p>
          </div>
        </div>

        {/* Reference Distance Selection */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase font-extrabold tracking-[0.06em] text-black dark:text-[#F5F5F0]">
              Select Reference Distance
            </label>
            <span className="text-xs font-extrabold text-black dark:text-[#D4FF3F] tabular-nums">
              Target: {selectedDistance} cm ({Math.round(selectedDistance / 2.54)} inches)
            </span>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {presets.map((p) => {
              const isSelected = selectedDistance === p.cm;
              return (
                <button
                  key={p.cm}
                  type="button"
                  onClick={() => setSelectedDistance(p.cm)}
                  className={`p-3 rounded-[18px] text-left border-2 border-black dark:border-[#F5F5F0] transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#FF851B] dark:bg-[#FF8A1F] text-[#0D0D0D] shadow-[3px_3px_0px_#000000] dark:shadow-[3px_3px_0px_#F5F5F0] -translate-y-0.5'
                      : 'bg-white dark:bg-[#262626] text-black dark:text-[#F5F5F0] hover:bg-[#FFD84D] dark:hover:bg-[#D4FF3F] dark:hover:text-[#0D0D0D]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-extrabold tabular-nums">
                      {p.label}
                    </span>
                    {p.recommended && (
                      <span
                        className={`text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded-full border border-black ${
                          isSelected ? 'bg-white text-black' : 'bg-[#FFD84D] dark:bg-[#D4FF3F] text-black'
                        }`}
                      >
                        Recommended
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold mt-1 ${isSelected ? 'text-black/85' : 'text-black/75 dark:text-[#D4D4CE]'}`}>
                    {p.desc}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Fine Tuning Slider & Stepper */}
          <div className="p-3.5 rounded-[20px] bg-white dark:bg-[#262626] border-2 border-black dark:border-[#F5F5F0] flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between text-xs font-bold text-black dark:text-[#F5F5F0]">
              <span>Fine Adjustment (30 cm - 90 cm)</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedDistance((prev) => Math.max(30, prev - 1))}
                  className="w-6 h-6 rounded-full bg-[#FFF8ED] dark:bg-[#141414] border border-black dark:border-[#F5F5F0] flex items-center justify-center font-extrabold text-black dark:text-[#F5F5F0] cursor-pointer"
                >
                  -
                </button>
                <span className="w-12 text-center font-extrabold text-black dark:text-[#D4FF3F] tabular-nums">
                  {selectedDistance} cm
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDistance((prev) => Math.min(90, prev + 1))}
                  className="w-6 h-6 rounded-full bg-[#FFF8ED] dark:bg-[#141414] border border-black dark:border-[#F5F5F0] flex items-center justify-center font-extrabold text-black dark:text-[#F5F5F0] cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              min={30}
              max={90}
              step={1}
              value={selectedDistance}
              onChange={(e) => setSelectedDistance(Number(e.target.value))}
              className="w-full accent-[#FF851B] dark:accent-[#D4FF3F] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-bold text-black/75 dark:text-[#D4D4CE] uppercase tracking-wider">
              <span>30 cm (Close)</span>
              <span>50 cm (Recommended)</span>
              <span>90 cm (Far)</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-2.5 pt-2 border-t-2 border-black dark:border-white">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={handleExecuteCalibration}
              className="flex-1 py-3 px-5 pill-primary text-xs sm:text-sm font-extrabold cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isMonitoring && telemetry.faceDetected
                  ? `Calibrate at ${selectedDistance} cm`
                  : `Save Distance (${selectedDistance} cm)`}
              </span>
            </button>

            {telemetry.isCalibrated && (
              <button
                type="button"
                onClick={handleReset}
                className="py-3 px-5 pill-secondary text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5"
                title="Reset calibration back to default baseline"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-center text-xs font-extrabold text-black/75 dark:text-white/75 hover:text-black dark:hover:text-white cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
