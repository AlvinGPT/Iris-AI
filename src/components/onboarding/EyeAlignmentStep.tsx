import React from 'react';
import { Check, Eye, AlertCircle, Loader2 } from 'lucide-react';
import { EyeAlignmentEvaluation } from '../../services/onboardingVisionService';
import { FaceAlignmentOverlay } from './FaceAlignmentOverlay';
import { OnboardingDesignTokens } from './onboardingTheme';

interface EyeAlignmentStepProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  evaluation: EyeAlignmentEvaluation;
  onContinue: () => void;
  tokens: OnboardingDesignTokens;
}

export const EyeAlignmentStep: React.FC<EyeAlignmentStepProps> = ({
  videoRef,
  evaluation,
  onContinue,
  tokens,
}) => {
  const {
    faceDetected,
    bothEyesDetected,
    canContinueFromEyeAlignment,
    detectionState,
    instruction,
    secondaryStatus,
    stabilityProgressPct,
    faceBox,
    eyeMidpoint,
    leftEye,
    rightEye,
    eyeLevelY,
    filledTicks,
  } = evaluation;

  const isVivid = tokens.styleMode === 'vivid';
  const isLoading =
    detectionState === 'Initializing camera' ||
    detectionState === 'Loading face detection';
  const isError = detectionState === 'Camera or detection error';

  const primaryStatusHeading = canContinueFromEyeAlignment
    ? 'Ready'
    : detectionState === 'Position your face' && instruction !== 'Position your face'
    ? `Position your face — ${instruction}`
    : detectionState;

  return (
    <section
      aria-labelledby="eye-alignment-heading"
      className={`w-full max-w-2xl mx-auto p-6 sm:p-9 flex flex-col motion-safe:transition-opacity motion-safe:duration-200 ${tokens.panelCard}`}
    >
      <div className="mb-5">
        <h1
          id="eye-alignment-heading"
          className={`${tokens.headingFont} ${
            isVivid ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
          } mb-2`}
        >
          Align your eyes
        </h1>
        <p className={`${tokens.bodyFont} text-sm sm:text-base leading-relaxed`}>
          Keep your head in a comfortable position and look naturally toward the screen. We’ll check that both eyes are clearly visible inside the corner brackets.
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
          mode="eyeAlignment"
          faceDetected={faceDetected}
          isAligned={canContinueFromEyeAlignment}
          statusLabel={detectionState}
          detectionState={detectionState}
          faceBox={faceBox}
          faceCenter={eyeMidpoint}
          leftEye={leftEye}
          rightEye={rightEye}
          eyeLevelY={eyeLevelY}
          filledTicks={filledTicks}
          tokens={tokens}
        />
      </div>

      {/* Status & Single Instruction Readout */}
      <div
        role="status"
        aria-live="polite"
        className={`p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          canContinueFromEyeAlignment
            ? tokens.successCallout
            : isError
            ? tokens.warningCallout
            : bothEyesDetected
            ? tokens.infoCallout
            : tokens.subCard
        }`}
      >
        <div className="flex items-center gap-3">
          {canContinueFromEyeAlignment ? (
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                isVivid
                  ? 'bg-black text-[#25D6C1] border-2 border-black'
                  : 'bg-[#0D9488] text-white'
              }`}
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
          ) : isError ? (
            <AlertCircle
              className={`w-5 h-5 shrink-0 ${
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
          ) : (
            <Eye
              className={`w-5 h-5 shrink-0 ${
                isVivid ? 'text-black dark:text-[#398BFF]' : 'text-[#0284C7]'
              }`}
              aria-hidden="true"
            />
          )}

          <div>
            <p className={`${tokens.labelFont} text-sm sm:text-base`}>
              {primaryStatusHeading}
            </p>
            <p
              className={`${tokens.bodyFont} text-xs mt-0.5 ${
                isVivid ? 'text-black/85 dark:text-white/85' : 'text-[#475569]'
              }`}
            >
              {canContinueFromEyeAlignment && secondaryStatus
                ? secondaryStatus
                : 'Ensure both eyes remain unobstructed inside the frame.'}
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 shrink-0 text-xs tabular-nums ${
            isVivid ? 'text-black dark:text-white font-bold' : 'text-[#475569]'
          }`}
        >
          <span>Left &amp; right eyes</span>
          <span aria-hidden="true">·</span>
          <span className={tokens.labelFont}>
            {bothEyesDetected ? `Verified (${stabilityProgressPct}%)` : 'Checking'}
          </span>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={!canContinueFromEyeAlignment}
          onClick={() => {
            if (canContinueFromEyeAlignment) {
              onContinue();
            }
          }}
          className={`w-full sm:w-auto text-sm sm:text-base ${
            canContinueFromEyeAlignment
              ? tokens.primaryButton
              : tokens.primaryButtonDisabled
          }`}
        >
          Calibrate position
        </button>
      </div>
    </section>
  );
};
