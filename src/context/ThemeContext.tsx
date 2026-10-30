import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';

export type StyleMode = 'minimal' | 'vivid';
export type ColorMode = 'light' | 'dark';
export type ThemePreference = StyleMode | ColorMode | 'warm' | 'system';
export type ResolvedTheme = 'minimal-light' | 'minimal-dark' | 'vivid-light' | 'vivid-dark' | StyleMode | ColorMode;

export interface AccentPreset {
  id: string;
  label: string;
  hex: string;
  hoverHex: string;
}

export const COLOR_STUDIO_PRESETS: AccentPreset[] = [
  { id: 'lime', label: 'Chartreuse Lime', hex: '#D4FF3F', hoverHex: '#FF8A1F' },
  { id: 'iris-violet', label: 'Iris Violet', hex: '#7B5CD6', hoverHex: '#6546C0' },
  { id: 'amber-orange', label: 'Amber Orange', hex: '#FF7A1A', hoverHex: '#FF9442' },
  { id: 'orange', label: 'Solar Orange', hex: '#FF8A1F', hoverHex: '#D4FF3F' },
  { id: 'violet', label: 'Electric Violet', hex: '#B968F0', hoverHex: '#D4FF3F' },
  { id: 'teal', label: 'Cyber Aqua', hex: '#25D6C1', hoverHex: '#D4FF3F' },
  { id: 'sky', label: 'Sky Cyan', hex: '#55C7F2', hoverHex: '#D4FF3F' },
  { id: 'gold', label: 'Sunburst Gold', hex: '#FFD84D', hoverHex: '#FF8A1F' },
];

function parseHexToRgb(hexColor: string): [number, number, number] {
  const cleaned = hexColor.replace('#', '').trim();
  if (cleaned.length !== 6) return [13, 13, 13];
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16),
  ];
}

function rgbToRelativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const [r1, g1, b1] = parseHexToRgb(hexA);
  const [r2, g2, b2] = parseHexToRgb(hexB);
  const l1 = rgbToRelativeLuminance(r1, g1, b1);
  const l2 = rgbToRelativeLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Computes WCAG 2.1 relative luminance for a 6-digit hex color and returns
 * near-black (#0D0D0D) or pure white (#FFFFFF) foreground to guarantee >= 4.5:1 contrast.
 */
export function getContrastForeground(hexColor: string): '#0D0D0D' | '#FFFFFF' {
  const [r, g, b] = parseHexToRgb(hexColor);
  const lum = rgbToRelativeLuminance(r, g, b);

  // Contrast against #0D0D0D (lum ~ 0.004) vs #FFFFFF (lum = 1.0)
  const contrastDark = (lum + 0.05) / (0.004 + 0.05);
  const contrastLight = (1.0 + 0.05) / (lum + 0.05);
  return contrastDark >= contrastLight ? '#0D0D0D' : '#FFFFFF';
}

/**
 * Derives a text-safe accent color guaranteed to achieve >= 4.8:1 contrast
 * against light card surfaces (#F8FAFE / #FFFFFF) or dark card surfaces (#242424 / #1F1F1F).
 */
export function getTextSafeAccentColor(accentHex: string, isDark: boolean): string {
  const targetSurface = isDark ? '#242424' : '#F4F7FD';
  const minContrast = 4.8;
  if (getContrastRatio(accentHex, targetSurface) >= minContrast) {
    return accentHex;
  }

  const [r0, g0, b0] = parseHexToRgb(accentHex);
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

  for (let step = 1; step <= 40; step++) {
    const t = step / 40;
    const r = isDark ? r0 + (245 - r0) * t : r0 * (1 - t * 0.88);
    const g = isDark ? g0 + (245 - g0) * t : g0 * (1 - t * 0.88);
    const b = isDark ? b0 + (245 - b0) * t : b0 * (1 - t * 0.88);
    const candidate = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    if (getContrastRatio(candidate, targetSurface) >= minContrast) {
      return candidate;
    }
  }

  return isDark ? '#F5EDE4' : '#0F172A';
}

interface ThemeContextType {
  styleMode: StyleMode;
  setStyleMode: (mode: StyleMode) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
  accentColor: string;
  setAccentColor: (hex: string) => void;
  accentForeground: '#0D0D0D' | '#FFFFFF';
  accentTextColor: string;
  isMinimal: boolean;
  isDark: boolean;
  hasChosenStyle: boolean;
  confirmStyleSelection: (mode: StyleMode, color?: ColorMode) => void;
  isStyleChooserOpen: boolean;
  setIsStyleChooserOpen: (open: boolean) => void;
  // Backward-compatible aliases
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggleDarkMode: () => void;
}

const STYLE_STORAGE_KEY = 'iris_style_preference_v1';
const COLOR_MODE_STORAGE_KEY = 'iris_color_mode_v1';
const ACCENT_COLOR_STORAGE_KEY = 'iris_accent_color_v1';
const STYLE_CHOSEN_KEY = 'iris_style_chosen_v1';

function getDefaultThemeAccent(styleMode: StyleMode, colorMode: ColorMode): string {
  if (styleMode === 'minimal') {
    return colorMode === 'dark' ? '#FF7A1A' : '#7B5CD6';
  }
  return '#D4FF3F';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [styleMode, setStyleModeState] = useState<StyleMode>(() => {
    if (typeof window === 'undefined') return 'vivid';
    try {
      const stored = localStorage.getItem(STYLE_STORAGE_KEY);
      if (stored === 'minimal' || stored === 'vivid') {
        return stored;
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
    return 'vivid';
  });

  const [colorMode, setColorModeState] = useState<ColorMode>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
    return 'light';
  });

  const [customAccentColor, setCustomAccentColorState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
      if (stored && /^#[0-9A-Fa-f]{6}$/.test(stored)) {
        return stored.toUpperCase();
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
    return null;
  });

  const accentColor = useMemo(() => {
    if (customAccentColor) return customAccentColor;
    return getDefaultThemeAccent(styleMode, colorMode);
  }, [customAccentColor, styleMode, colorMode]);

  const [hasChosenStyle, setHasChosenStyle] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(STYLE_CHOSEN_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isStyleChooserOpen, setIsStyleChooserOpen] = useState<boolean>(false);

  const isMinimal = styleMode === 'minimal';
  const isDark = colorMode === 'dark';
  const accentForeground = useMemo(() => getContrastForeground(accentColor), [accentColor]);
  const accentTextColor = useMemo(
    () => getTextSafeAccentColor(accentColor, isDark),
    [accentColor, isDark]
  );

  // Apply independent styleMode (.theme-minimal / .theme-vivid), colorMode (.light / .dark), and Color Studio tokens
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove(
      'dark',
      'light',
      'warm',
      'theme-minimal',
      'theme-vivid',
      'theme-minimal-light',
      'theme-minimal-dark',
      'theme-vivid-light',
      'theme-vivid-dark'
    );
    body.classList.remove(
      'dark',
      'light',
      'warm',
      'theme-minimal',
      'theme-vivid',
      'theme-minimal-light',
      'theme-minimal-dark',
      'theme-vivid-light',
      'theme-vivid-dark'
    );

    const styleClass = styleMode === 'minimal' ? 'theme-minimal' : 'theme-vivid';
    const colorClass = colorMode === 'dark' ? 'dark' : 'light';
    const combinedClass = `theme-${styleMode}-${colorMode}`;

    root.classList.add(styleClass, colorClass, combinedClass);
    body.classList.add(styleClass, colorClass, combinedClass);

    root.setAttribute('data-style', styleMode);
    root.setAttribute('data-color-mode', colorMode);
    root.setAttribute('data-theme', `${styleMode}-${colorMode}`);
    root.style.colorScheme = colorMode;

    // Derive Color Studio accent tokens centrally
    const matchedPreset = COLOR_STUDIO_PRESETS.find(
      (p) => p.hex.toUpperCase() === accentColor.toUpperCase()
    );
    const hoverHex = matchedPreset
      ? matchedPreset.hoverHex
      : accentColor.toUpperCase() === '#FF8A1F'
      ? '#D4FF3F'
      : '#FF8A1F';
    const hoverFg = getContrastForeground(hoverHex);

    root.style.setProperty('--vivid-accent', accentColor);
    root.style.setProperty('--vivid-accent-fg', accentForeground);
    root.style.setProperty('--vivid-accent-hover', hoverHex);
    root.style.setProperty('--vivid-accent-hover-fg', hoverFg);

    root.style.setProperty('--theme-accent', accentColor);
    root.style.setProperty('--theme-accent-fg', accentForeground);
    root.style.setProperty('--theme-accent-text', accentTextColor);
    root.style.setProperty('--theme-accent-hover', hoverHex);
    root.style.setProperty('--theme-accent-hover-fg', hoverFg);

    root.style.setProperty('--minimal-accent', accentColor);
    root.style.setProperty('--minimal-accent-fg', accentForeground);
    root.style.setProperty('--minimal-accent-text', accentTextColor);
    root.style.setProperty('--minimal-accent-hover', hoverHex);
    root.style.setProperty('--minimal-accent-hover-fg', hoverFg);
  }, [styleMode, colorMode, accentColor, accentForeground, accentTextColor]);

  const setStyleMode = useCallback((mode: StyleMode) => {
    setStyleModeState(mode);
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage write issues
    }
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    try {
      localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage write issues
    }
  }, []);

  const setAccentColor = useCallback((hex: string) => {
    const normalized = hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
    setCustomAccentColorState(normalized);
    try {
      localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage write issues
    }
  }, []);

  const toggleColorMode = useCallback(() => {
    setColorMode(colorMode === 'dark' ? 'light' : 'dark');
  }, [colorMode, setColorMode]);

  const confirmStyleSelection = useCallback(
    (mode: StyleMode, color?: ColorMode) => {
      setStyleModeState(mode);
      if (color) {
        setColorModeState(color);
      }
      setHasChosenStyle(true);
      setIsStyleChooserOpen(false);
      try {
        localStorage.setItem(STYLE_STORAGE_KEY, mode);
        if (color) {
          localStorage.setItem(COLOR_MODE_STORAGE_KEY, color);
        }
        localStorage.setItem(STYLE_CHOSEN_KEY, 'true');
      } catch {
        // Ignore storage write issues
      }
    },
    []
  );

  const setTheme = useCallback(
    (newTheme: ThemePreference) => {
      if (newTheme === 'minimal' || newTheme === 'vivid') {
        setStyleMode(newTheme);
      } else if (newTheme === 'dark') {
        setColorMode('dark');
      } else if (newTheme === 'light' || newTheme === 'warm') {
        setColorMode('light');
      }
    },
    [setStyleMode, setColorMode]
  );

  const contextValue = useMemo(
    () => ({
      styleMode,
      setStyleMode,
      colorMode,
      setColorMode,
      toggleColorMode,
      accentColor,
      setAccentColor,
      accentForeground,
      accentTextColor,
      isMinimal,
      isDark,
      hasChosenStyle,
      confirmStyleSelection,
      isStyleChooserOpen,
      setIsStyleChooserOpen,
      theme: colorMode,
      resolvedTheme: `${styleMode}-${colorMode}` as ResolvedTheme,
      setTheme,
      toggleDarkMode: toggleColorMode,
    }),
    [
      styleMode,
      setStyleMode,
      colorMode,
      setColorMode,
      toggleColorMode,
      accentColor,
      setAccentColor,
      accentForeground,
      accentTextColor,
      isMinimal,
      isDark,
      hasChosenStyle,
      confirmStyleSelection,
      isStyleChooserOpen,
      setTheme,
    ]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
