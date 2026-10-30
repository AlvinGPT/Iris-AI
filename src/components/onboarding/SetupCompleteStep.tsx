import React from 'react';
import { Check } from 'lucide-react';
import { PersistedCalibrationMetadata } from '../../services/onboardingVisionService';
import { OnboardingDesignTokens } from './onboardingTheme';

interface SetupCompleteStepProps {
  calibrationMetadata: PersistedCalibrationMetadata | null;
  onOpenDashboard: () => void;
  tokens: OnboardingDesignTokens;
}

const SUMMARY_ROWS = [
  { label: 'Camera access', value: 'Ready.' },
  { label: 'Face and eye alignment', value: 'Confirmed.' },
  { label: 'Calibration', value: 'Saved.' },
];

export const SetupCompleteStep: React.FC<SetupCompleteStepProps> = ({
  calibrationMetadata,
  onOpenDashboard,
  tokens,
}) => {
  const isVivid = tokens.styleMode === 'vivid';

  return (
    <section
      aria-labelledby="setup-complete-heading"
      className={`w-full max-w-xl mx-auto p-8 sm:p-11 flex flex-col items-center text-center motion-safe:transition-opacity motion-safe:duration-200 ${tokens.panelCard}`}
    >
      <div
        className={`mb-6 w-12 h-12 rounded-full flex items-center justify-center ${
          isVivid
            ? 'bg-[#25D6C1] border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)] text-black'
            : 'bg-[#0D9488]/15 border border-[#0D9488]/30 text-[#0D9488]'
        }`}
      >
        <Check className="w-6 h-6" aria-hidden="true" />
      </div>

      <h1
        id="setup-complete-heading"
        className={`${tokens.headingFont} ${
          isVivid ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
        } mb-2.5`}
      >
        You&apos;re all set
      </h1>

      <p
        className={`${tokens.bodyFont} text-sm sm:text-base ${
          isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#334155]'
        } mb-7 max-w-md leading-relaxed`}
      >
        Your camera position is ready. IRIS can now help you become more aware of your screen habits.
      </p>

      {/* Summary list */}
      <dl
        className={`w-full text-left divide-y ${
          isVivid ? 'divide-[var(--border-ink)]' : 'divide-[#E2E8F0]'
        } px-5 py-2 mb-8 ${tokens.subCard}`}
      >
        {SUMMARY_ROWS.map((row) => (
          <div
            key={row.label}
            className="py-3 flex items-center justify-between gap-4 text-sm"
          >
            <dt className={isVivid ? 'text-[var(--fg-secondary)] font-medium' : 'text-[#475569]'}>
              {row.label}
            </dt>
            <dd
              className={`${tokens.labelFont} ${
                isVivid ? 'text-[var(--fg-primary)]' : 'text-[#0D9488]'
              } flex items-center gap-1.5`}
            >
              <Check
                className={`w-3.5 h-3.5 shrink-0 ${
                  isVivid ? 'text-[#25D6C1] dark:text-[#25D6C1]' : ''
                }`}
                aria-hidden="true"
              />
              <span>{row.value}</span>
            </dd>
          </div>
        ))}
        {calibrationMetadata && (
          <div
            className={`py-3 flex items-center justify-between gap-4 text-xs ${tokens.mutedText}`}
          >
            <dt>Calibration reference</dt>
            <dd
              className={`tabular-nums font-medium ${
                isVivid ? 'text-[var(--fg-primary)] font-bold' : 'text-[#334155]'
              }`}
            >
              Saved on-device
            </dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        onClick={onOpenDashboard}
        className={`w-full sm:w-auto min-w-[220px] text-sm sm:text-base ${tokens.primaryButton}`}
      >
        Open IRIS dashboard
      </button>

      <p className={`text-xs ${tokens.mutedText} mt-3.5`}>
        You can start or pause camera monitoring at any time from the dashboard.
      </p>
    </section>
  );
};
