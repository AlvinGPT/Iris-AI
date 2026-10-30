import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { OnboardingDesignTokens } from './onboardingTheme';

interface PrivacyPolicyStepProps {
  acknowledged: boolean;
  onToggleAcknowledged: (checked: boolean) => void;
  onContinue: () => void;
  tokens: OnboardingDesignTokens;
}

const PRIVACY_ITEMS = [
  {
    title: 'Local processing',
    description: 'Camera frames are processed locally on this device.',
  },
  {
    title: 'No video storage',
    description: 'Raw camera footage is not saved or uploaded by IRIS.',
  },
  {
    title: 'Derived measurements',
    description:
      'The application may store measurements such as blink counts, monitoring events, and calibrated distance information.',
  },
  {
    title: 'Retention',
    description:
      'Stored records are retained for the configured 30-day period and then deleted according to the application’s retention policy.',
  },
  {
    title: 'Optional AI insights',
    description:
      'If Gemini insights are enabled, only the minimum necessary verified aggregate statistics may be sent to the configured service. Do not send camera frames.',
  },
];

export const PrivacyPolicyStep: React.FC<PrivacyPolicyStepProps> = ({
  acknowledged,
  onToggleAcknowledged,
  onContinue,
  tokens,
}) => {
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const isVivid = tokens.styleMode === 'vivid';

  return (
    <section
      aria-labelledby="privacy-heading"
      className={`w-full max-w-2xl mx-auto p-7 sm:p-10 flex flex-col motion-safe:transition-opacity motion-safe:duration-200 ${tokens.panelCard}`}
    >
      <div className="mb-6">
        <h1
          id="privacy-heading"
          className={`${tokens.headingFont} ${
            isVivid ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
          } mb-2`}
        >
          Your camera. Your device.
        </h1>
        <p
          className={`${tokens.bodyFont} text-sm sm:text-base ${
            isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#475569]'
          }`}
        >
          Review how IRIS handles camera frames and derived measurements before camera access is requested.
        </p>
      </div>

      {/* Short, readable policy statements */}
      <dl
        className={`divide-y ${
          isVivid
            ? 'divide-[var(--border-ink)] border-t-2 border-b-2 border-[var(--border-ink)]'
            : 'divide-[#E2E8F0] border-t border-b border-[#E2E8F0]'
        } mb-5`}
      >
        {PRIVACY_ITEMS.map((item) => (
          <div
            key={item.title}
            className="py-3.5 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4"
          >
            <dt className={`${tokens.labelFont} text-sm sm:w-44 shrink-0`}>
              {item.title}
            </dt>
            <dd
              className={`${tokens.bodyFont} text-sm ${
                isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#334155]'
              } leading-relaxed`}
            >
              {item.description}
            </dd>
          </div>
        ))}
      </dl>

      {/* Expandable "How your data is handled" section */}
      <div className={`mb-6 ${tokens.subCard}`}>
        <button
          type="button"
          aria-expanded={isDetailsExpanded}
          aria-controls="privacy-handling-details"
          onClick={() => setIsDetailsExpanded((prev) => !prev)}
          className={`w-full px-4 py-3 flex items-center justify-between text-left text-sm ${tokens.labelFont} cursor-pointer rounded-xl ${tokens.focusRing}`}
        >
          <span>How your data is handled</span>
          {isDetailsExpanded ? (
            <ChevronUp
              className={`w-4 h-4 shrink-0 ${
                isVivid ? 'text-[var(--fg-primary)]' : 'text-[#475569]'
              }`}
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className={`w-4 h-4 shrink-0 ${
                isVivid ? 'text-[var(--fg-primary)]' : 'text-[#475569]'
              }`}
              aria-hidden="true"
            />
          )}
        </button>

        {isDetailsExpanded && (
          <div
            id="privacy-handling-details"
            className={`px-4 pb-4 pt-2 text-xs sm:text-sm space-y-2.5 ${
              isVivid
                ? 'border-t-2 border-[var(--border-ink)]'
                : 'border-t border-[#E2E8F0]/80'
            } ${tokens.bodyFont}`}
          >
            <p className="leading-relaxed">
              <strong>In-memory vision pipeline:</strong> When monitoring is enabled, MediaPipe Face Landmarker processes each video frame directly in volatile browser memory to compute facial landmark coordinates and eye aspect ratios. Video frames are discarded immediately after each frame evaluation.
            </p>
            <p className="leading-relaxed">
              <strong>Local storage &amp; 30-day retention:</strong> Numeric summaries (such as blink counts, session compliance logs, and your normalized reference calibration) are stored locally on this device and automatically pruned after 30 days. You can clear all saved logs or reset calibration at any time from Preferences.
            </p>
            <p className="leading-relaxed">
              <strong>Strict separation of camera frames:</strong> No webcam image, video stream, or facial photograph is ever written to disk or transmitted over the network.
            </p>
          </div>
        )}
      </div>

      {/* Required Checkbox */}
      <label
        htmlFor="privacy-acknowledge-checkbox"
        className={`flex items-start gap-3.5 p-4 mb-6 cursor-pointer select-none transition-colors ${
          isVivid && acknowledged
            ? 'bg-[#FFD84D] dark:bg-[#181818] border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)] rounded-2xl text-black dark:text-white'
            : tokens.subCard
        }`}
      >
        <input
          id="privacy-acknowledge-checkbox"
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onToggleAcknowledged(e.target.checked)}
          className={`mt-0.5 w-4 h-4 rounded cursor-pointer shrink-0 ${
            isVivid
              ? 'border-2 border-black accent-black'
              : 'border-[#94A3B8] text-[#0284C7]'
          } ${tokens.focusRing}`}
        />
        <span
          className={`${tokens.bodyFont} text-sm ${
            isVivid
              ? acknowledged
                ? 'text-black dark:text-white font-bold'
                : 'text-[var(--fg-primary)] font-bold'
              : 'text-[#0F172A] font-medium'
          } leading-snug`}
        >
          I understand how IRIS uses camera access and stores derived measurements.
        </span>
      </label>

      {/* Primary Action */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={!acknowledged}
          onClick={() => {
            if (acknowledged) {
              onContinue();
            }
          }}
          className={`w-full sm:w-auto min-w-[160px] text-sm sm:text-base ${
            acknowledged ? tokens.primaryButton : tokens.primaryButtonDisabled
          }`}
        >
          Continue
        </button>
      </div>
    </section>
  );
};
