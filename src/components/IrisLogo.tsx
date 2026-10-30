import React, { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

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

  // Pick optimal resolution to avoid downloading large originals while staying crisp
  const { src, srcSet } = useMemo(() => {
    const color = effectiveVariant;
    if (numSize <= 16) {
      return {
        src: `/assets/iris-emblem-${color}-16.png`,
        srcSet: `/assets/iris-emblem-${color}-16.png 1x, /assets/iris-emblem-${color}-32.png 2x`,
      };
    }
    if (numSize <= 32) {
      return {
        src: `/assets/iris-emblem-${color}-32.png`,
        srcSet: `/assets/iris-emblem-${color}-32.png 1x, /assets/iris-emblem-${color}-64.png 2x`,
      };
    }
    if (numSize <= 64) {
      return {
        src: `/assets/iris-emblem-${color}-64.png`,
        srcSet: `/assets/iris-emblem-${color}-64.png 1x, /assets/iris-emblem-${color}-128.png 2x`,
      };
    }
    if (numSize <= 128) {
      return {
        src: `/assets/iris-emblem-${color}-128.png`,
        srcSet: `/assets/iris-emblem-${color}-128.png 1x, /assets/iris-emblem-${color}-512.png 2x`,
      };
    }
    return {
      src: `/assets/iris-emblem-${color}-512.png`,
      srcSet: `/assets/iris-emblem-${color}-512.png 1x, /assets/iris-emblem-${color}-cropped.png 2x`,
    };
  }, [effectiveVariant, numSize]);

  const dimensionStyle: React.CSSProperties = {
    width: typeof size === 'number' ? `${size}px` : size,
    height: typeof size === 'number' ? `${size}px` : size,
    aspectRatio: '1 / 1',
  };

  return (
    <img
      src={src}
      srcSet={srcSet}
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
