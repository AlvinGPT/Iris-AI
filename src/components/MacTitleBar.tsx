import React, { useState, useEffect } from 'react';

export const MacTitleBar: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const desktopCheck =
      typeof window !== 'undefined' &&
      Boolean((window as any).irisNative?.isDesktop || /electron/i.test(navigator.userAgent));
    setIsDesktop(desktopCheck);
  }, []);

  if (!isDesktop) {
    return null;
  }

  const handleClose = () => {
    try {
      (window as any).irisNative?.closeWindow?.();
    } catch (e) {
      console.warn('Failed to close window:', e);
    }
  };

  const handleMinimize = () => {
    try {
      (window as any).irisNative?.minimizeWindow?.();
    } catch (e) {
      console.warn('Failed to minimize window:', e);
    }
  };

  const handleMaximize = () => {
    try {
      (window as any).irisNative?.maximizeWindow?.();
    } catch (e) {
      console.warn('Failed to toggle maximize window:', e);
    }
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 h-8 z-[99999] flex items-center justify-between px-3 select-none pointer-events-auto"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={handleMaximize}
    >
      {/* Top-Left macOS-style Traffic Light Buttons */}
      <div
        className="flex items-center gap-2 py-1 px-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Close Button - Red (#FF5F56) */}
        <button
          type="button"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
          className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] flex items-center justify-center transition-all duration-150 cursor-pointer hover:brightness-90 active:brightness-75"
        >
          <svg
            className={`w-1.5 h-1.5 text-[#4D0000] stroke-[2.5] transition-opacity duration-150 ${
              isHovered ? 'opacity-90' : 'opacity-0'
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Minimize Button - Yellow (#FFBD2E) */}
        <button
          type="button"
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize"
          className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123] flex items-center justify-center transition-all duration-150 cursor-pointer hover:brightness-90 active:brightness-75"
        >
          <svg
            className={`w-1.5 h-1.5 text-[#664400] stroke-[3] transition-opacity duration-150 ${
              isHovered ? 'opacity-90' : 'opacity-0'
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Maximize Button - Green (#27C93F) */}
        <button
          type="button"
          onClick={handleMaximize}
          title="Maximize / Fullscreen"
          aria-label="Maximize"
          className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29] flex items-center justify-center transition-all duration-150 cursor-pointer hover:brightness-90 active:brightness-75"
        >
          <svg
            className={`w-1.5 h-1.5 text-[#004D11] stroke-[2.5] transition-opacity duration-150 ${
              isHovered ? 'opacity-90' : 'opacity-0'
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Center & Right area: strictly NO 'IRIS' title text */}
      <div className="flex-1 h-full" />
    </div>
  );
};
