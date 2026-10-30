import React, { useEffect, useState } from 'react';
import {
  ENABLE_REAL_LANDMARK_MESH,
  NormalizedFaceBox,
  Point2D,
  TruthfulDetectionState,
} from '../../services/onboardingVisionService';
import { OnboardingDesignTokens } from './onboardingTheme';

interface FaceAlignmentOverlayProps {
  mode: 'facePositioning' | 'eyeAlignment' | 'calibration';
  faceDetected: boolean;
  isAligned: boolean;
  statusLabel: string;
  detectionState?: TruthfulDetectionState;
  uiState?:
    | 'initializing_camera'
    | 'loading_detector'
    | 'searching'
    | 'face_detected'
    | 'aligning'
    | 'hold_still'
    | 'aligned'
    | 'detected_not_aligned'
    | 'error';
  faceBox: NormalizedFaceBox | null;
  faceCenter: Point2D | null;
  silhouettePoints?: Point2D[] | null;
  meshPoints?: Point2D[] | null;
  leftEye: Point2D | null;
  rightEye: Point2D | null;
  eyeLevelY: number | null;
  filledTicks?: boolean[];
  activeSector?: number | null;
  tokens: OnboardingDesignTokens;
}

export const FaceAlignmentOverlay: React.FC<FaceAlignmentOverlayProps> = ({
  faceDetected,
  isAligned,
  meshPoints,
  tokens,
}) => {
  const isVivid = tokens.styleMode === 'vivid';

  // Neutral bracket color by default; transitions (250ms ease-out) to success token when step predicate is satisfied
  const bracketStroke = isAligned
    ? tokens.tickFilledColor
    : faceDetected
    ? 'rgba(255, 255, 255, 0.92)'
    : 'rgba(255, 255, 255, 0.58)';

  const bracketStrokeWidth = isVivid ? 3.2 : 2.2;

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Optional thin, low-opacity landmark mesh drawn from real detector landmarks in the shared [0..1] coordinate system */}
      {ENABLE_REAL_LANDMARK_MESH &&
        faceDetected &&
        meshPoints &&
        meshPoints.length > 10 && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
          >
            {/* Subtle contour polyline over the outer face oval landmarks (first 36 points) */}
            <polygon
              points={meshPoints
                .slice(0, Math.min(36, meshPoints.length))
                .map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
                .join(' ')}
              fill="none"
              stroke={isAligned ? tokens.tickFilledColor : 'rgba(255, 255, 255, 0.24)'}
              strokeWidth="0.28"
              strokeOpacity="0.45"
            />
            {/* Real landmark vertices */}
            {meshPoints.map((pt, idx) => (
              <circle
                key={idx}
                cx={(pt.x * 100).toFixed(2)}
                cy={(pt.y * 100).toFixed(2)}
                r="0.42"
                fill={isAligned ? tokens.tickFilledColor : 'rgba(255, 255, 255, 0.42)'}
              />
            ))}
          </svg>
        )}

      {/* Four Rounded Corner Brackets (shared coordinate space) */}
      <svg
        viewBox="0 0 320 240"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        {/* Top-Left Rounded Corner Bracket */}
        <path
          d="M 36 74 L 36 44 Q 36 28 52 28 L 82 28"
          fill="none"
          stroke={bracketStroke}
          strokeWidth={bracketStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-bracket="top-left"
          data-bracket-state={isAligned ? 'success' : 'neutral'}
          style={{
            transition: 'stroke 240ms ease-out',
          }}
        />
        {/* Top-Right Rounded Corner Bracket */}
        <path
          d="M 238 28 L 268 28 Q 284 28 284 44 L 284 74"
          fill="none"
          stroke={bracketStroke}
          strokeWidth={bracketStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-bracket="top-right"
          data-bracket-state={isAligned ? 'success' : 'neutral'}
          style={{
            transition: 'stroke 240ms ease-out',
          }}
        />
        {/* Bottom-Left Rounded Corner Bracket */}
        <path
          d="M 36 166 L 36 196 Q 36 212 52 212 L 82 212"
          fill="none"
          stroke={bracketStroke}
          strokeWidth={bracketStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-bracket="bottom-left"
          data-bracket-state={isAligned ? 'success' : 'neutral'}
          style={{
            transition: 'stroke 240ms ease-out',
          }}
        />
        {/* Bottom-Right Rounded Corner Bracket */}
        <path
          d="M 238 212 L 268 212 Q 284 212 284 196 L 284 166"
          fill="none"
          stroke={bracketStroke}
          strokeWidth={bracketStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          data-bracket="bottom-right"
          data-bracket-state={isAligned ? 'success' : 'neutral'}
          style={{
            transition: 'stroke 240ms ease-out',
          }}
        />
      </svg>
    </div>
  );
};

export interface FaceIdCompletionGlyphProps {
  /**
   * 'animating': plays the ~1150ms Face ID-style bracket merge -> face glyph draw -> circle + checkmark resolve
   * 'completed': shows the final resolved state (or immediately when prefers-reduced-motion is enabled)
   */
  stage: 'animating' | 'completed';
  reducedMotion: boolean;
  onSkipAnimation?: () => void;
  tokens: OnboardingDesignTokens;
}

/**
 * Original IRIS Face ID-style completion glyph animation.
 * - Uses only transform, opacity, and stroke-dashoffset with cubic-bezier(0.22, 1, 0.36, 1).
 * - Under prefers-reduced-motion or stage === 'completed', displays the resolved glyph + checkmark immediately.
 */
export const FaceIdCompletionGlyph: React.FC<FaceIdCompletionGlyphProps> = ({
  stage,
  reducedMotion,
  onSkipAnimation,
  tokens,
}) => {
  const isVivid = tokens.styleMode === 'vivid';
  const [animStep, setAnimStep] = useState<'initial' | 'draw_glyph' | 'resolve_check'>(
    reducedMotion || stage === 'completed' ? 'resolve_check' : 'initial'
  );

  useEffect(() => {
    if (reducedMotion || stage === 'completed') {
      setAnimStep('resolve_check');
      return;
    }

    setAnimStep('initial');
    const rafId = requestAnimationFrame(() => {
      setAnimStep('draw_glyph');
    });
    const resolveTimer = setTimeout(() => {
      setAnimStep('resolve_check');
    }, 540);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(resolveTimer);
    };
  }, [stage, reducedMotion]);

  const strokeColor = tokens.tickFilledColor;
  const strokeW = isVivid ? 3.2 : 2.2;
  const isInitial = animStep === 'initial';
  const isResolved = animStep === 'resolve_check';

  return (
    <div
      role="button"
      tabIndex={stage === 'animating' ? 0 : -1}
      aria-label={
        stage === 'animating'
          ? 'Calibration completion animation. Press Enter or click to skip animation.'
          : 'Calibration complete'
      }
      onClick={() => {
        if (stage === 'animating' && onSkipAnimation) {
          onSkipAnimation();
        }
      }}
      onKeyDown={(e) => {
        if (
          stage === 'animating' &&
          onSkipAnimation &&
          (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')
        ) {
          e.preventDefault();
          onSkipAnimation();
        }
      }}
      className={`relative w-full h-full flex flex-col items-center justify-center select-none ${
        stage === 'animating' ? 'cursor-pointer' : ''
      } ${tokens.focusRing}`}
    >
      <svg
        viewBox="0 0 200 200"
        className="w-40 h-40 sm:w-44 sm:h-44"
        aria-hidden="true"
      >
        {/* Phase 1 & 2: Four Corner Brackets easing inward + Original IRIS Face Glyph */}
        <g
          style={{
            opacity: isInitial ? 0.35 : isResolved ? 0.16 : 1,
            transform: isInitial
              ? 'scale(1.18)'
              : isResolved
              ? 'scale(0.88)'
              : 'scale(1)',
            transformOrigin: '100px 100px',
            transition: reducedMotion
              ? 'none'
              : 'opacity 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* Rounded-square frame with corner gaps */}
          <path
            d="M 52 76 L 52 64 Q 52 52 64 52 L 76 52"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
          <path
            d="M 124 52 L 136 52 Q 148 52 148 64 L 148 76"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
          <path
            d="M 52 124 L 52 136 Q 52 148 64 148 L 76 148"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
          <path
            d="M 124 148 L 136 148 Q 148 148 148 136 L 148 124"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Two vertical eye ticks */}
          <line
            x1="80"
            y1="78"
            x2="80"
            y2="90"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray="16"
            strokeDashoffset={isInitial ? 16 : 0}
            style={{
              transition: reducedMotion
                ? 'none'
                : 'stroke-dashoffset 320ms cubic-bezier(0.22, 1, 0.36, 1) 80ms',
            }}
          />
          <line
            x1="120"
            y1="78"
            x2="120"
            y2="90"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray="16"
            strokeDashoffset={isInitial ? 16 : 0}
            style={{
              transition: reducedMotion
                ? 'none'
                : 'stroke-dashoffset 320ms cubic-bezier(0.22, 1, 0.36, 1) 120ms',
            }}
          />

          {/* Nose hook */}
          <path
            d="M 100 82 L 100 103 Q 100 109 93 109"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="40"
            strokeDashoffset={isInitial ? 40 : 0}
            style={{
              transition: reducedMotion
                ? 'none'
                : 'stroke-dashoffset 360ms cubic-bezier(0.22, 1, 0.36, 1) 160ms',
            }}
          />

          {/* Smile arc */}
          <path
            d="M 80 120 Q 100 135 120 120"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray="50"
            strokeDashoffset={isInitial ? 50 : 0}
            style={{
              transition: reducedMotion
                ? 'none'
                : 'stroke-dashoffset 380ms cubic-bezier(0.22, 1, 0.36, 1) 220ms',
            }}
          />
        </g>

        {/* Phase 3: Resolving Circle + Checkmark that draws in */}
        <g
          style={{
            opacity: isResolved ? 1 : 0,
            transform: isResolved ? 'scale(1)' : 'scale(0.92)',
            transformOrigin: '100px 100px',
            transition: reducedMotion
              ? 'none'
              : 'opacity 360ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <circle
            cx="100"
            cy="100"
            r="56"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray="360"
            strokeDashoffset={isResolved ? 0 : 360}
            style={{
              transition: reducedMotion
                ? 'none'
                : 'stroke-dashoffset 460ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
          <path
            d="M 76 101 L 93 118 L 126 84"
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeW + 0.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="80"
            strokeDashoffset={isResolved ? 0 : 80}
            style={{
              transition: reducedMotion
                ? 'none'
                : 'stroke-dashoffset 400ms cubic-bezier(0.22, 1, 0.36, 1) 140ms',
            }}
          />
        </g>
      </svg>

      {stage === 'animating' && !reducedMotion && (
        <span className="mt-2 text-xs text-white/75">
          Press Enter or click to skip animation
        </span>
      )}
    </div>
  );
};
