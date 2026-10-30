import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  RotateCcw,
  ScanFace,
  Sun,
} from 'lucide-react';
import {
  COMPLETION_ANIMATION_DURATION_MS,
  FacePositioningEvaluation,
  GUIDED_FACE_CHECK_STEPS,
} from '../../services/onboardingVisionService';
import { FaceAlignmentOverlay, FaceIdCompletionGlyph } from './FaceAlignmentOverlay';
import { OnboardingDesignTokens } from './onboardingTheme';

export type CalibrationScreenPhase = 'intro' | 'scanning' | 'completing' | 'completed' | 'skipped';

interface CameraPositionStepProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  evaluation: FacePositioningEvaluation;
  phase: CalibrationScreenPhase;
  recoveryReason?: string;
  onStartScanning: () => void;
  onCancelToIntro: () => void;
  onRestart: () => void;
  onSkipCalibration: () => void;
  onContinue: () => void;
  tokens: OnboardingDesignTokens;
}

export const CameraPositionStep: React.FC<CameraPositionStepProps> = ({
  videoRef,
  evaluation,
  phase,
  recoveryReason,
  onStartScanning,
  onCancelToIntro,
  onRestart,
  onSkipCalibration,
  onContinue,
  tokens,
}) => {
  const {
    faceDetected,
    canContinueFromFacePositioning,
    detectionState,
    uiState,
    instruction,
    helperText,
    currentStepIndex,
    totalSteps,
    currentStepId,
    completedStepIds,
    stepSatisfied,
    stepTimedOut,
    timeoutDiagnostic,
    faceBox,
    faceCenter,
    meshPoints,
    leftEye,
    rightEye,
    eyeLevelY,
  } = evaluation;

  const isVivid = tokens.styleMode === 'vivid';
  const isError = detectionState === 'Camera or detection error';
  const isLoading =
    detectionState === 'Initializing camera' ||
    detectionState === 'Loading face detection';

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  // Small vertical offset (< 8px) + opacity crossfade when currentStepId changes
  const [stepEntered, setStepEntered] = useState(true);
  useEffect(() => {
    if (reducedMotion) {
      setStepEntered(true);
      return;
    }
    setStepEntered(false);
    const rafId = requestAnimationFrame(() => {
      setStepEntered(true);
    });
    return () => cancelAnimationFrame(rafId);
  }, [currentStepId, reducedMotion]);

  // Manage completion animation timer when entering 'completing' phase
  const [animFinished, setAnimFinished] = useState(false);
  useEffect(() => {
    if (phase === 'completed') {
      setAnimFinished(true);
      return;
    }
    if (phase !== 'completing') {
      setAnimFinished(false);
      return;
    }
    if (reducedMotion) {
      setAnimFinished(true);
      return;
    }
    setAnimFinished(false);
    const timer = setTimeout(() => {
      setAnimFinished(true);
    }, COMPLETION_ANIMATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase, reducedMotion]);

  const completedCount = completedStepIds.length;
  const displayStepNumber = Math.min(totalSteps, currentStepIndex + 1);
  const isCompletionPhase = phase === 'completing' || phase === 'completed';
  const canClickContinue =
    (isCompletionPhase && canContinueFromFacePositioning && (animFinished || phase === 'completed')) ||
    phase === 'skipped';

  // ============================================================================
  // 1. INTRO PHASE
  // ============================================================================
  if (phase === 'intro') {
    return (
      <section
        aria-labelledby="camera-position-heading"
        className={`w-full max-w-2xl mx-auto p-6 sm:p-9 flex flex-col motion-safe:transition-opacity motion-safe:duration-200 ${tokens.panelCard}`}
      >
        {recoveryReason && (
          <div
            role="note"
            className={`mb-4 px-4 py-2.5 text-xs sm:text-sm ${tokens.warningCallout}`}
          >
            {recoveryReason}
          </div>
        )}

        <div className="mb-6">
          <h1
            id="camera-position-heading"
            className={`${tokens.headingFont} ${
              isVivid ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
            } mb-2`}
          >
            Find your position
          </h1>
          <p className={`${tokens.bodyFont} text-sm sm:text-base leading-relaxed`}>
            Complete a quick 5-step guided face check so IRIS can calibrate your viewing distance and natural open-eye baseline.
          </p>
        </div>

        {/* Two Requirement Hints ("Uncovered face", "Good lighting") */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
          <div className={`p-4 flex items-start gap-3.5 ${tokens.subCard}`}>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isVivid
                  ? 'bg-[#FFD84D] text-black border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)]'
                  : 'bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD]'
              }`}
            >
              <ScanFace className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className={`${tokens.labelFont} text-sm sm:text-base`}>
                Uncovered face
              </h2>
              <p
                className={`${tokens.bodyFont} text-xs mt-0.5 ${
                  isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#475569]'
                }`}
              >
                Keep both eyes and your face clearly visible in the camera frame.
              </p>
            </div>
          </div>

          <div className={`p-4 flex items-start gap-3.5 ${tokens.subCard}`}>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isVivid
                  ? 'bg-[#55C7F2] text-black border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)]'
                  : 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
              }`}
            >
              <Sun className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className={`${tokens.labelFont} text-sm sm:text-base`}>
                Good lighting
              </h2>
              <p
                className={`${tokens.bodyFont} text-xs mt-0.5 ${
                  isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#475569]'
                }`}
              >
                Sit in even room lighting without strong backlight behind you.
              </p>
            </div>
          </div>
        </div>

        {/* Truthful Camera / Detector Error Callout if applicable */}
        {isError && (
          <div className={`p-4 mb-5 flex items-center gap-3 ${tokens.warningCallout}`}>
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <p className={`${tokens.bodyFont} text-xs sm:text-sm`}>
              Camera or face detector encountered an error. Check camera permissions and try again.
            </p>
          </div>
        )}

        {/* Primary Action + Privacy Notice */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <p className={`text-xs ${tokens.mutedText}`}>
            Processed locally on this device · Video is never saved or uploaded
          </p>

          <button
            type="button"
            onClick={onStartScanning}
            className={`w-full sm:w-auto min-w-[190px] text-sm sm:text-base ${tokens.primaryButton}`}
          >
            Start calibration
          </button>
        </div>
      </section>
    );
  }

  // ============================================================================
  // 2. SCANNING PHASE & 3. COMPLETION / SKIPPED PHASE
  // ============================================================================
  return (
    <section
      aria-labelledby="camera-position-heading"
      className={`w-full max-w-2xl mx-auto p-6 sm:p-9 flex flex-col motion-safe:transition-opacity motion-safe:duration-200 ${tokens.panelCard}`}
    >
      {/* Top Bar: Segmented Progress Indicator + Step N of M */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span
            className={`text-xs uppercase tracking-wider ${
              isVivid
                ? 'font-dm font-bold text-[var(--fg-primary)]'
                : 'font-semibold text-[#475569]'
            }`}
          >
            {isCompletionPhase
              ? 'Calibration complete'
              : phase === 'skipped'
              ? 'Calibration incomplete'
              : 'Scanning your face'}
          </span>

          <span
            className={`text-xs tabular-nums ${
              isVivid
                ? 'font-dm font-bold text-[var(--fg-primary)]'
                : 'font-semibold text-[#0F172A]'
            }`}
          >
            {isCompletionPhase
              ? `${totalSteps} of ${totalSteps} completed`
              : `Step ${displayStepNumber} of ${totalSteps}`}
          </span>
        </div>

        {/* Accessible ARIA Progressbar + 5-Segment Visual Bar */}
        <div
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-label={`Guided face calibration: ${completedCount} of ${totalSteps} steps completed`}
          className="grid grid-cols-5 gap-2"
        >
          {GUIDED_FACE_CHECK_STEPS.map((s, idx) => {
            const isStepDone = completedStepIds.includes(s.id);
            const isStepCurrent = !isCompletionPhase && idx === currentStepIndex;
            return (
              <div
                key={s.id}
                data-step-segment={s.id}
                data-segment-completed={isStepDone ? 'true' : 'false'}
                className={`h-2.5 rounded-full overflow-hidden ${
                  isVivid
                    ? 'bg-white dark:bg-[#262626] border-2 border-[var(--border-ink)]'
                    : 'bg-[#E2E8F0]'
                }`}
              >
                <div
                  className={`h-full transition-all duration-250 ease-out ${
                    isStepDone
                      ? isVivid
                        ? 'w-full bg-[#25D6C1]'
                        : 'w-full bg-[#0D9488]'
                      : isStepCurrent && stepSatisfied
                      ? isVivid
                        ? 'w-1/2 bg-[#FF851B]'
                        : 'w-1/2 bg-[#0284C7]'
                      : 'w-0'
                  }`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Rounded-Rectangle Live Mirrored Preview with 4 Corner Brackets OR Completion Glyph */}
      <div
        className={`relative w-full aspect-[4/3] max-h-[340px] mb-5 ${tokens.previewContainer}`}
      >
        {/* Live Mirrored Video Element (fades out smoothly on completion; no still frame is ever captured) */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover scale-x-[-1]"
          style={{
            opacity: isCompletionPhase || phase === 'skipped' ? 0 : 1,
            transition: reducedMotion
              ? 'none'
              : 'opacity 320ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />

        {/* Scanning Phase: Four Rounded Corner Brackets + Optional Real Landmark Mesh */}
        {!isCompletionPhase && phase !== 'skipped' && (
          <FaceAlignmentOverlay
            mode="facePositioning"
            faceDetected={faceDetected}
            isAligned={stepSatisfied}
            statusLabel={instruction}
            detectionState={detectionState}
            uiState={uiState}
            faceBox={faceBox}
            faceCenter={faceCenter}
            meshPoints={meshPoints}
            leftEye={leftEye}
            rightEye={rightEye}
            eyeLevelY={eyeLevelY}
            tokens={tokens}
          />
        )}

        {/* Completion Phase: Original IRIS Face ID-Style Completion Animation */}
        {isCompletionPhase && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0F172A]/95">
            <FaceIdCompletionGlyph
              stage={animFinished || phase === 'completed' ? 'completed' : 'animating'}
              reducedMotion={reducedMotion}
              onSkipAnimation={() => setAnimFinished(true)}
              tokens={tokens}
            />
          </div>
        )}

        {/* Skipped Phase Honest Notice Inside Frame */}
        {phase === 'skipped' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#0F172A]/95 text-white">
            <AlertCircle className="w-10 h-10 text-[#F59E0B] mb-3" aria-hidden="true" />
            <p className="text-base font-semibold mb-1">
              Calibration skipped for now
            </p>
            <p className="text-xs text-white/80 max-w-md leading-relaxed">
              Personalization and relative screen-distance estimates will be limited until you complete camera calibration.
            </p>
          </div>
        )}
      </div>

      {/* Large Instruction Headline + Helper Line (with restrained < 8px vertical crossfade) */}
      <div
        role="status"
        aria-live="polite"
        style={{
          opacity: stepEntered ? 1 : 0,
          transform: stepEntered ? 'translateY(0px)' : 'translateY(5px)',
          transition: reducedMotion
            ? 'none'
            : 'opacity 220ms ease-out, transform 220ms ease-out',
        }}
        className={`p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isCompletionPhase
            ? tokens.successCallout
            : phase === 'skipped' || isError || stepTimedOut
            ? tokens.warningCallout
            : stepSatisfied
            ? tokens.infoCallout
            : tokens.subCard
        }`}
      >
        <div className="flex items-start sm:items-center gap-3">
          {isCompletionPhase ? (
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                isVivid
                  ? 'bg-black text-[#25D6C1] border-2 border-black'
                  : 'bg-[#0D9488] text-white'
              }`}
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
          ) : isError || stepTimedOut || phase === 'skipped' ? (
            <AlertCircle
              className={`w-5 h-5 shrink-0 mt-0.5 sm:mt-0 ${
                isVivid ? 'text-black dark:text-[#FF851B]' : 'text-[#B45309]'
              }`}
              aria-hidden="true"
            />
          ) : isLoading ? (
            <Loader2
              className={`w-5 h-5 animate-spin shrink-0 ${
                isVivid ? 'text-black dark:text-[#398BFF]' : 'text-[#0284C7]'
              }`}
              aria-hidden="true"
            />
          ) : null}

          <div>
            <h1
              id="camera-position-heading"
              className={`${tokens.headingFont} text-lg sm:text-xl ${
                isVivid && (isCompletionPhase || stepTimedOut || stepSatisfied)
                  ? 'text-black dark:text-white'
                  : ''
              }`}
            >
              {isCompletionPhase
                ? 'Calibration complete'
                : phase === 'skipped'
                ? 'Calibration incomplete — limited mode'
                : instruction}
            </h1>
            <p
              className={`${tokens.bodyFont} text-xs sm:text-sm mt-0.5 ${
                isVivid && (isCompletionPhase || stepTimedOut || stepSatisfied)
                  ? 'text-black/85 dark:text-white/85'
                  : isVivid
                  ? 'text-[var(--fg-secondary)]'
                  : 'text-[#475569]'
              }`}
            >
              {isCompletionPhase
                ? 'Your position reference has been saved locally.'
                : phase === 'skipped'
                ? 'Personalization and distance estimates will be limited. You can recalibrate at any time.'
                : timeoutDiagnostic || helperText}
            </p>
          </div>
        </div>

        {/* Timeout "Skip for now" button when a step times out */}
        {!isCompletionPhase && phase === 'scanning' && stepTimedOut && (
          <button
            type="button"
            onClick={onSkipCalibration}
            className={`shrink-0 text-xs sm:text-sm ${tokens.secondaryButton}`}
          >
            Skip for now
          </button>
        )}
      </div>

      {/* Privacy Notice */}
      <p className={`mb-5 text-xs text-center ${tokens.mutedText}`}>
        Processed locally on this device · Video is never saved or uploaded
      </p>

      {/* Bottom Controls: Back/Cancel, Restart, and Continue */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancelToIntro}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm ${tokens.secondaryButton}`}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm ${tokens.secondaryButton}`}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Restart</span>
          </button>
        </div>

        <button
          type="button"
          disabled={!canClickContinue}
          onClick={() => {
            if (canClickContinue) {
              onContinue();
            }
          }}
          className={`w-full sm:w-auto min-w-[200px] text-sm sm:text-base ${
            canClickContinue ? tokens.primaryButton : tokens.primaryButtonDisabled
          }`}
        >
          Continue
        </button>
      </div>
    </section>
  );
};
