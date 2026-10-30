import React from 'react';
import { OrbitingEyeLogo } from '../OrbitingEyeLogo';
import { OnboardingDesignTokens } from './onboardingTheme';

interface WelcomeStepProps {
  onGetStarted: () => void;
  tokens: OnboardingDesignTokens;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onGetStarted, tokens }) => {
  const isVivid = tokens.styleMode === 'vivid';

  return (
    <section
      aria-labelledby="welcome-heading"
      className={`w-full max-w-xl mx-auto p-8 sm:p-12 flex flex-col items-center text-center motion-safe:transition-opacity motion-safe:duration-200 ${tokens.panelCard}`}
    >
      {/* IRIS Hero Emblem */}
      <div className="mb-6 flex flex-col items-center">
        <OrbitingEyeLogo size={96} className="w-24 h-24 sm:w-28 sm:h-28" />
      </div>

      <h1
        id="welcome-heading"
        className={`${tokens.headingFont} ${
          isVivid ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
        } mb-3 text-balance`}
      >
        Welcome to IRIS
      </h1>

      <p
        className={`${tokens.bodyFont} text-base sm:text-lg ${
          isVivid ? 'text-[var(--fg-primary)] font-bold' : 'text-[#1E293B] font-medium'
        } mb-3 max-w-md`}
      >
        Let’s set up your screen-awareness companion.
      </p>

      <p
        className={`${tokens.bodyFont} text-sm sm:text-base ${
          isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#475569]'
        } mb-9 max-w-md leading-relaxed`}
      >
        First, we’ll explain how your camera is used, then help you find a comfortable camera position.
      </p>

      <div className="w-full max-w-xs flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onGetStarted}
          className={`w-full text-sm sm:text-base ${tokens.primaryButton}`}
        >
          Get started
        </button>

        <span className={`text-xs ${tokens.mutedText}`}>
          Takes about a minute
        </span>
      </div>
    </section>
  );
};
