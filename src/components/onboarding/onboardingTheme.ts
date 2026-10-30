import { StyleMode } from '../../context/ThemeContext';

export interface OnboardingDesignTokens {
  styleMode: StyleMode;
  pageShell: string;
  headerBar: string;
  panelCard: string;
  subCard: string;
  infoCallout: string;
  warningCallout: string;
  successCallout: string;
  headingFont: string;
  bodyFont: string;
  mutedText: string;
  dividerBorder: string;
  buttonFont: string;
  labelFont: string;
  primaryButton: string;
  primaryButtonDisabled: string;
  secondaryButton: string;
  focusRing: string;
  previewContainer: string;
  circularFrame: string;
  tickUnfilledColor: string;
  tickActiveColor: string;
  tickFilledColor: string;
  tickStrokeWidth: number;
  guideSearchingColor: string;
  guideAdjustingColor: string;
  guideAlignedColor: string;
  eyeMarkerColor: string;
}

export function getOnboardingTokens(styleMode: StyleMode): OnboardingDesignTokens {
  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2';

  if (styleMode === 'minimal') {
    return {
      styleMode: 'minimal',
      pageShell:
        'bg-[#F6F9FC] text-[#0F172A] font-[\'Plus_Jakarta_Sans\',sans-serif]',
      headerBar:
        'bg-white border-b border-[#E2E8F0] text-[#0F172A]',
      panelCard:
        'bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_2px_12px_rgba(15,23,42,0.04)] text-[#0F172A]',
      subCard:
        'bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#0F172A]',
      infoCallout:
        'bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#1E293B]',
      warningCallout:
        'bg-[#FFFBEB] border border-[#FDE68A] rounded-xl text-[#78350F]',
      successCallout:
        'bg-[#F0FDFA] border border-[#99F6E4] rounded-xl text-[#115E59]',
      headingFont:
        'font-[\'Urbanist\',sans-serif] font-semibold tracking-tight text-[#0F172A]',
      bodyFont:
        'font-[\'Plus_Jakarta_Sans\',sans-serif] font-normal text-[#334155]',
      mutedText: 'text-[#64748B]',
      dividerBorder: 'divide-[#E2E8F0] border-[#E2E8F0]',
      buttonFont:
        'font-[\'Plus_Jakarta_Sans\',sans-serif] font-semibold',
      labelFont:
        'font-[\'Plus_Jakarta_Sans\',sans-serif] font-semibold text-[#0F172A]',
      primaryButton:
        `font-['Plus_Jakarta_Sans',sans-serif] font-semibold rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white px-6 py-3 transition-colors cursor-pointer ${focusRing}`,
      primaryButtonDisabled:
        `font-['Plus_Jakarta_Sans',sans-serif] font-semibold rounded-lg bg-[#E2E8F0] text-[#64748B] px-6 py-3 cursor-not-allowed`,
      secondaryButton:
        `font-['Plus_Jakarta_Sans',sans-serif] font-semibold rounded-lg bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] px-5 py-2.5 transition-colors cursor-pointer ${focusRing}`,
      focusRing,
      previewContainer:
        'bg-[#0F172A] border border-[#CBD5E1] rounded-xl overflow-hidden',
      circularFrame:
        'bg-[#0F172A] border border-[#CBD5E1] shadow-[0_4px_20px_rgba(15,23,42,0.08)]',
      tickUnfilledColor: '#CBD5E1',
      tickActiveColor: '#0284C7',
      tickFilledColor: '#0D9488',
      tickStrokeWidth: 1.85,
      guideSearchingColor: '#94A3B8',
      guideAdjustingColor: '#0284C7',
      guideAlignedColor: '#0D9488',
      eyeMarkerColor: '#0284C7',
    };
  }

  // Style A — Vivid: Matches the main Vivid dashboard design system
  // Warm cream canvas (#FFF8ED in light, #050505 in dark), 2px solid ink borders,
  // hard-offset tactile shadows (4px 4px 0px), saturated color-block accents,
  // Cormorant Garamond expressive serif headings + DM Sans bold UI controls.
  const vividFocusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF851B] focus-visible:ring-offset-2';

  return {
    styleMode: 'vivid',
    pageShell:
      'bg-warm-canvas text-[var(--fg-primary)] font-dm',
    headerBar:
      'bg-[var(--card-white)] border-b-2 border-[var(--border-ink)] text-[var(--fg-primary)]',
    panelCard:
      'tactile-card-white text-[var(--fg-primary)]',
    subCard:
      'tactile-inner text-[var(--fg-primary)]',
    infoCallout:
      'bg-[#55C7F2] border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)] rounded-2xl text-[#0D0D0D]',
    warningCallout:
      'bg-[#FFD84D] dark:bg-[#D4FF3F] border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)] rounded-2xl text-[#0D0D0D]',
    successCallout:
      'bg-[#25D6C1] border-2 border-[var(--border-ink)] shadow-[2px_2px_0px_var(--border-ink)] rounded-2xl text-[#0D0D0D]',
    headingFont:
      'font-cormorant font-bold tracking-tight text-[var(--fg-primary)]',
    bodyFont:
      'font-dm font-normal text-[var(--fg-secondary)]',
    mutedText: 'text-[var(--fg-muted)] font-dm',
    dividerBorder: 'divide-[var(--border-ink)] border-[var(--border-ink)]',
    buttonFont:
      'font-dm font-bold',
    labelFont:
      'font-dm font-bold text-[var(--fg-primary)]',
    primaryButton:
      `btn-pill-primary px-7 py-3 ${vividFocusRing}`,
    primaryButtonDisabled:
      `font-dm font-bold rounded-full bg-[#E5E0D5] dark:bg-[#262626] text-[#737373] dark:text-[#A3A39E] border-2 border-[var(--border-ink)] px-7 py-3 opacity-65 cursor-not-allowed`,
    secondaryButton:
      `btn-pill-secondary px-5 py-2.5 ${vividFocusRing}`,
    focusRing: vividFocusRing,
    previewContainer:
      'bg-[#141414] border-2 border-[var(--border-ink)] shadow-[4px_4px_0px_var(--border-ink)] rounded-2xl overflow-hidden',
    circularFrame:
      'bg-[#141414] border-2 border-[var(--border-ink)] shadow-[4px_4px_0px_var(--border-ink)]',
    tickUnfilledColor: 'rgba(120, 120, 120, 0.34)',
    tickActiveColor: '#FF851B',
    tickFilledColor: '#25D6C1',
    tickStrokeWidth: 2.8,
    guideSearchingColor: '#55C7F2',
    guideAdjustingColor: '#FF851B',
    guideAlignedColor: '#25D6C1',
    eyeMarkerColor: '#25D6C1',
  };
}
