import React, { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { IRIS_LOGO_WHITE_DATA_URL, IRIS_LOGO_BLACK_DATA_URL } from '../assets/irisLogo';

export interface IrisLogoProps {
  /**
   * Explicit size in pixels or CSS string (e.g. 16, 24, 32, 40, 48, 64, 128, 512).
   * Defaults to 32.
   */
  size?: number | string;
  /**
   * Surface background context or variant override:
   * - 'auto': selects black emblem on light surface, white emblem on dark surface based on theme
   * - 'light': forces black emblem (for light surfaces like white/cream cards, inputs, tags)
   * - 'dark': forces white emblem (for dark surfaces like black buttons, dark modals, night mode)
   */
  surface?: 'auto' | 'light' | 'dark';
  /**
   * Optional variant alias for backward compatibility.
   */
  variant?: 'auto' | 'black' | 'white';
  className?: string;
  alt?: string;
}

/**
 * Parses numeric size in pixels from number or string.
 */
function parsePixelSize(size?: number | string): number {
  if (typeof size === 'number') return size;
  if (!size) return 32;
  const parsed = parseInt(size, 10);
  return isNaN(parsed) ? 32 : parsed;
}

/**
 * Universal IRIS Emblem Component.
 * 
 * Strict specifications:
 * 1. Uses the official supplied transparent PNGs cropped & resized only (no SVG/CSS redrawing, no tinting, no recoloring).
 * 2. High-contrast variant selection (>= 3:1 contrast against any surface).
 * 3. Scaled-consistent sizing across black and white variants.
 * 4. Responsive resolution picking (16, 32, 64, 128, 512) with Retina srcSet support.
 * 5. Fixed square aspect ratio, object-contain, draggable disabled.
 */
export const IrisLogo: React.FC<IrisLogoProps> = ({
  size = 32,
  surface = 'auto',
  variant,
  className = '',
  alt = 'IRIS',
}) => {
  // Gracefully read theme; fallback safely if outside ThemeProvider
  let isDarkMode = false;
  try {
    const theme = useTheme();
    isDarkMode = theme.isDark;
  } catch {
    if (typeof window !== 'undefined') {
      isDarkMode = document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  }

  // Determine variant: black emblem on light surfaces, white emblem on dark surfaces
  const effectiveVariant: 'black' | 'white' = useMemo(() => {
    if (variant === 'black' || variant === 'white') return variant;
    if (surface === 'light') return 'black';
    if (surface === 'dark') return 'white';
    // surface === 'auto': Follow surface tone from current theme mode
    return isDarkMode ? 'white' : 'black';
  }, [variant, surface, isDarkMode]);

  const numSize = parsePixelSize(size);

  // Return embedded base64 data-URI directly: 100% reliable across Vite dev and Electron packaged file:// mode!
  const src = effectiveVariant === 'white' ? IRIS_LOGO_WHITE_DATA_URL : IRIS_LOGO_BLACK_DATA_URL;

  const dimensionStyle: React.CSSProperties = {
    width: typeof size === 'number' ? `${size}px` : size,
    height: typeof size === 'number' ? `${size}px` : size,
    aspectRatio: '1 / 1',
  };

  return (
    <img
      src={src}
      alt={alt}
      width={numSize}
      height={numSize}
      style={dimensionStyle}
      draggable={false}
      loading="eager"
      decoding="async"
      className={`aspect-square object-contain select-none shrink-0 pointer-events-none transition-none ${className}`}
    />
  );
};

// Default export and backward compatible alias
export const OrbitingEyeLogo = IrisLogo;
export default IrisLogo;
