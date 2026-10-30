import React, { useEffect, useRef, useState } from 'react';

export interface AnimatedNumberProps {
  value: number | string | null | undefined;
  fallback?: string;
  className?: string;
  suffix?: string;
  prefix?: string;
}

/**
 * Renders a live numeric or status metric with a subtle, restrained ~220ms fade + vertical shift
 * ONLY when the underlying displayed value actually changes.
 * - Uses `tabular-nums` (`font-variant-numeric: tabular-nums`) so digit changes never shift layout.
 * - Respects `prefers-reduced-motion: reduce`.
 * - Never animates on re-renders where `value` is unchanged.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  fallback = '--',
  className = '',
  suffix = '',
  prefix = '',
}) => {
  const displayValue =
    value === null || value === undefined || value === ''
      ? fallback
      : `${prefix}${value}${suffix}`;

  const prevValueRef = useRef<string>(displayValue);
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevValueRef.current !== displayValue) {
      prevValueRef.current = displayValue;

      // Respect user reduced-motion preference
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!prefersReducedMotion) {
        setIsAnimating(false);
        // Trigger subtle 220ms transition on next microtask frame
        const rafId = requestAnimationFrame(() => {
          setIsAnimating(true);
        });
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => {
          setIsAnimating(false);
        }, 230);

        return () => {
          cancelAnimationFrame(rafId);
        };
      }
    }
  }, [displayValue]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <span
      className={`inline-block tabular-nums iris-metric-number ${
        isAnimating ? 'iris-metric-number-changed' : ''
      } ${className}`.trim()}
    >
      {displayValue}
    </span>
  );
};
