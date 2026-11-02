import React, { useEffect, useState } from 'react';
import type { EdgeOverlayState } from '../types';

export const IrisScreenEdgeOverlay: React.FC = () => {
  const [edgeState, setEdgeState] = useState<EdgeOverlayState>({
    activeMode: 'default',
    blinkAlert: false,
    distanceAlert: false,
    blinkRate: null,
    screenDistance: null,
  });

  // Listen to peripheral edge lighting update
  useEffect(() => {
    const unsubEdge = window.irisNative?.onEdgeOverlayUpdate?.((incoming: EdgeOverlayState) => {
      setEdgeState(incoming);
    });

    return () => {
      if (unsubEdge) unsubEdge();
    };
  }, []);

  // Screen-edge lighting is active ONLY in Gaming Mode
  const isGamingMode = edgeState.activeMode === 'gaming';
  const hasAlert = isGamingMode && (edgeState.blinkAlert || edgeState.distanceAlert);

  // Compute peripheral glow style
  let glowBoxShadow = 'none';
  let glowColor = 'transparent';

  if (hasAlert) {
    if (edgeState.blinkAlert && edgeState.distanceAlert) {
      glowColor = 'rgba(255, 42, 42, 0.85)';
      glowBoxShadow = `
        inset 0 0 50px 12px rgba(255, 42, 42, 0.85),
        inset 0 0 100px 30px rgba(255, 140, 0, 0.5)
      `;
    } else if (edgeState.blinkAlert) {
      glowColor = 'rgba(255, 42, 42, 0.85)';
      glowBoxShadow = `
        inset 0 0 55px 12px rgba(255, 42, 42, 0.85),
        inset 0 0 110px 32px rgba(255, 42, 42, 0.45)
      `;
    } else {
      glowColor = 'rgba(255, 140, 0, 0.85)';
      glowBoxShadow = `
        inset 0 0 55px 12px rgba(255, 140, 0, 0.85),
        inset 0 0 110px 32px rgba(255, 140, 0, 0.4)
      `;
    }
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden pointer-events-none">
      {/* ================= GAMING MODE PERIPHERAL SCREEN-EDGE LIGHTING ================= */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-700 ease-out"
        style={{
          boxShadow: glowBoxShadow,
          opacity: hasAlert ? 1 : 0,
          backgroundColor: 'transparent',
        }}
      >
        {hasAlert && (
          <div
            className="w-full h-full pointer-events-none iris-glow-breathe"
            style={{
              color: glowColor,
              boxShadow: `inset 0 0 30px 4px ${glowColor}`,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default IrisScreenEdgeOverlay;
