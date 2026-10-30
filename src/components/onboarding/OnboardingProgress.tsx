import React from 'react';
import { OnboardingStep } from '../../types';
import { OnboardingDesignTokens } from './onboardingTheme';

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
  tokens: OnboardingDesignTokens;
}

const STEP_SEQUENCE: Array<{ id: OnboardingStep; number: number; label: string }> = [
  { id: 'welcome', number: 1, label: 'Welcome' },
  { id: 'privacy', number: 2, label: 'Privacy' },
  { id: 'cameraPermission', number: 3, label: 'Camera access' },
  { id: 'facePositioning', number: 4, label: 'Position' },
  { id: 'eyeAlignment', number: 5, label: 'Eye alignment' },
  { id: 'calibration', number: 6, label: 'Calibration' },
];

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({ currentStep, tokens }) => {
  const isComplete = currentStep === 'complete';
  const activeEntry = STEP_SEQUENCE.find((s) => s.id === currentStep);
  const currentNumber = isComplete ? 6 : activeEntry ? activeEntry.number : 1;

  if (tokens.styleMode === 'minimal') {
    return (
      <nav aria-label="Onboarding setup progress" className="w-full flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm">
          <span className={`${tokens.labelFont} tabular-nums`}>
            {isComplete ? 'Setup complete' : `Step ${currentNumber} of 6`}
          </span>
          {!isComplete && activeEntry && (
            <>
              <span aria-hidden="true" className="text-[#94A3B8]">·</span>
              <span className="text-[#475569]">{activeEntry.label}</span>
            </>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5" aria-hidden="true">
          {STEP_SEQUENCE.map((s) => {
            const isDone = isComplete || s.number < currentNumber;
            const isCurrent = !isComplete && s.number === currentNumber;
            return (
              <span
                key={s.id}
                className={`h-1.5 rounded-sm transition-all duration-200 ${
                  isCurrent
                    ? 'w-7 bg-[#0284C7]'
                    : isDone
                    ? 'w-4 bg-[#0D9488]'
                    : 'w-4 bg-[#E2E8F0]'
                }`}
              />
            );
          })}
        </div>
      </nav>
    );
  }

  // Vivid style: matches the Vivid dashboard aesthetic (2px solid ink outlines, tactile segments, bold DM Sans)
  return (
    <nav aria-label="Onboarding setup progress" className="w-full flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 text-sm">
        <span className="px-2.5 py-0.5 rounded-full bg-[#FFD84D] text-black border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)] font-dm font-bold text-xs tabular-nums">
          {isComplete ? 'Setup complete' : `Step ${currentNumber} of 6`}
        </span>
        {!isComplete && activeEntry && (
          <>
            <span aria-hidden="true" className="text-[var(--fg-muted)] font-bold">·</span>
            <span className="font-dm font-bold text-[var(--fg-primary)]">{activeEntry.label}</span>
          </>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1.5" aria-hidden="true">
        {STEP_SEQUENCE.map((s) => {
          const isDone = isComplete || s.number < currentNumber;
          const isCurrent = !isComplete && s.number === currentNumber;
          return (
            <span
              key={s.id}
              className={`h-2.5 rounded-full border-2 border-[var(--border-ink)] transition-all duration-200 ${
                isCurrent
                  ? 'w-8 bg-[#FF851B] shadow-[1px_1px_0px_var(--border-ink)]'
                  : isDone
                  ? 'w-5 bg-[#25D6C1]'
                  : 'w-5 bg-white dark:bg-[#262626]'
              }`}
            />
          );
        })}
      </div>
    </nav>
  );
};
