import React from 'react';
import { Check, AlertCircle, RefreshCw } from 'lucide-react';
import {
  CalibrationProgressState,
  NormalizedFaceBox,
  Point2D,
} from '../../services/onboardingVisionService';
import { FaceAlignmentOverlay } from './FaceAlignmentOverlay';
import { OnboardingDesignTokens } from './onboardingTheme';

interface CalibrationStepProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  calibrationState: CalibrationProgressState;
  faceBox: NormalizedFaceBox | null;
  faceCenter: Point2D | null;
  leftEye: Point2D | null;
  rightEye: Point2D | null;
  eyeLevelY: number | null;
  faceDetected: boolean;
  onStartOrRetryCalibration: () => void;
  onContinueToComplete: () => void;
  tokens: OnboardingDesignTokens;
}

const CALIBRATION_STAGES = [
  'Checking camera',
  'Confirming face and eye alignment',
  'Collecting reference measurements',
  'Saving calibration',
] as const;

export const CalibrationStep: React.FC<CalibrationStepProps> = ({
  videoRef,
  calibrationState,
  faceBox,
  faceCenter,
  leftEye,
  rightEye,
  eyeLevelY,
  faceDetected,
  onStartOrRetryCalibration,
  onContinueToComplete,
  tokens,
}) => {
  const {
    phase,
    progressPct,
    samplesCollected,
    requiredSamples,
    calibrationSucceeded,
    calibrationSaved,
    canFinishCalibration,
    errorExplanation,
    filledTicks,
  } = calibrationState;

  const isVivid = tokens.styleMode === 'vivid';
  const isFailed = phase === 'Calibration failed' || !!errorExplanation;

  const currentStageIndex = CALIBRATION_STAGES.findIndex((s) => s === phase);

  return (
    <section
      aria-labelledby="calibration-heading"
      className={`w-full max-w-2xl mx-auto p-6 sm:p-9 flex flex-col motion-safe:transition-opacity motion-safe:duration-200 ${tokens.panelCard}`}
    >
      <div className="mb-5">
        <h1
          id="calibration-heading"
          className={`${tokens.headingFont} ${
            isVivid ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
          } mb-2`}
        >
          Calibrate your position
        </h1>
        <p className={`${tokens.bodyFont} text-sm sm:text-base leading-relaxed`}>
          Sit as you normally would while using your laptop. We’ll record a reference position so IRIS can compare future positioning against it.
        </p>
      </div>

      {/* Rounded-Rectangle Live Mirrored Preview with 4 Corner Brackets */}
      <div
        className={`relative w-full aspect-[4/3] max-h-[340px] mb-5 ${tokens.previewContainer}`}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover scale-x-[-1]"
        />

        <FaceAlignmentOverlay
          mode="calibration"
          faceDetected={faceDetected}
          isAligned={canFinishCalibration || (!isFailed && faceDetected)}
          statusLabel={
            canFinishCalibration
              ? 'Reference position recorded'
              : isFailed
              ? 'Reposition required'
              : phase
          }
          faceBox={faceBox}
          faceCenter={faceCenter}
          leftEye={leftEye}
          rightEye={rightEye}
          eyeLevelY={eyeLevelY}
          filledTicks={filledTicks}
          tokens={tokens}
        />
      </div>

      {/* Real-work Calibration Progress & Status Panel */}
      <div
        role="status"
        aria-live="polite"
        className={`p-4 sm:p-5 mb-6 ${
          canFinishCalibration
            ? tokens.successCallout
            : isFailed
            ? tokens.warningCallout
            : tokens.subCard
        }`}
      >
        <div className="flex items-center justify-between gap-4 mb-2.5">
          <div className="flex items-center gap-2.5">
            {canFinishCalibration ? (
              <Check
                className={`w-4 h-4 shrink-0 ${
                  isVivid ? 'text-black dark:text-[#25D6C1]' : 'text-[#0D9488]'
                }`}
                aria-hidden="true"
              />
            ) : isFailed ? (
              <AlertCircle
                className={`w-4 h-4 shrink-0 ${
                  isVivid ? 'text-black dark:text-[#FF851B]' : 'text-[#B45309]'
                }`}
                aria-hidden="true"
              />
            ) : null}
            <span className={`${tokens.labelFont} text-sm sm:text-base`}>
              {canFinishCalibration
                ? 'Position saved'
                : isFailed
                ? 'Calibration paused'
                : phase}
            </span>
          </div>

          <span
            className={`text-xs tabular-nums font-medium ${
              isVivid ? 'text-black dark:text-white font-bold' : 'text-[#475569]'
            }`}
          >
            {samplesCollected} / {requiredSamples} samples ({progressPct}%)
          </span>
        </div>

        {/* Real Progress Bar */}
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Calibration ${progressPct}% complete`}
          className={`w-full h-2.5 rounded-full overflow-hidden mb-3 ${
            isVivid
              ? 'bg-white dark:bg-[#111111] border-2 border-[var(--border-ink)]'
              : 'bg-[#E2E8F0]'
          }`}
        >
          <div
            className={`h-full motion-safe:transition-all motion-safe:duration-150 ${
              isVivid
                ? isFailed
                  ? 'bg-[#FF851B]'
                  : canFinishCalibration
                  ? 'bg-[#25D6C1]'
                  : 'bg-[#FFD84D]'
                : isFailed
                ? 'bg-[#D97706]'
                : canFinishCalibration
                ? 'bg-[#0D9488]'
                : 'bg-[#0284C7]'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* 4 Stage Verification List */}
        {!isFailed && (
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs ${
              isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#475569]'
            }`}
          >
            {CALIBRATION_STAGES.map((stageLabel, idx) => {
              const isStageDone =
                canFinishCalibration ||
                (currentStageIndex > idx && currentStageIndex !== -1);
              const isStageActive = !canFinishCalibration && currentStageIndex === idx;
              return (
                <div
                  key={stageLabel}
                  className={`flex items-center gap-2 ${
                    isStageActive
                      ? isVivid
                        ? 'text-[var(--fg-primary)] font-bold'
                        : 'text-[#0F172A] font-semibold'
                      : isStageDone
                      ? isVivid
                        ? 'text-[var(--fg-primary)] font-semibold'
                        : 'text-[#0D9488]'
                      : isVivid
                      ? 'text-[var(--fg-muted)]'
                      : 'text-[#64748B]'
                  }`}
                >
                  <span aria-hidden="true">{isStageDone ? '✓' : isStageActive ? '→' : '·'}</span>
                  <span>{stageLabel}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Failure Explanation */}
        {isFailed && errorExplanation && (
          <p
            className={`${tokens.bodyFont} text-xs sm:text-sm leading-relaxed ${
              isVivid ? 'text-black dark:text-white' : 'text-[#78350F]'
            }`}
          >
            {errorExplanation}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {isFailed ? (
          <button
            type="button"
            onClick={onStartOrRetryCalibration}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 text-sm sm:text-base ${tokens.primaryButton}`}
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Retry calibration</span>
          </button>
        ) : (
          <span className={`text-xs ${tokens.mutedText}`}>
            Saving position locally
          </span>
        )}

        <button
          type="button"
          disabled={!canFinishCalibration || !calibrationSucceeded || !calibrationSaved}
          onClick={() => {
            if (canFinishCalibration && calibrationSucceeded && calibrationSaved) {
              onContinueToComplete();
            }
          }}
          className={`w-full sm:w-auto min-w-[170px] text-sm sm:text-base ${
            canFinishCalibration && calibrationSucceeded && calibrationSaved
              ? tokens.primaryButton
              : tokens.primaryButtonDisabled
          }`}
        >
          Continue
        </button>
      </div>
    </section>
  );
};
