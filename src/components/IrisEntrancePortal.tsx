import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OrbitingEyeLogo } from './OrbitingEyeLogo';
import { signInWithGoogle, User } from '../lib/firebase';
import { Eye, Loader2, Paintbrush, Check, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface IrisEntrancePortalProps {
  onAuthenticated: (user: User) => void;
}

type Stage = 'loading' | 'intro' | 'signin';

export const IrisEntrancePortal: React.FC<IrisEntrancePortalProps> = ({
  onAuthenticated,
}) => {
  const { styleMode, setStyleMode, colorMode, toggleColorMode, isMinimal, isDark } = useTheme();

  // Stage management: LOADING -> INTRO -> SIGN_IN
  const [stage, setStage] = useState<Stage>('loading');
  const [loadProgress, setLoadProgress] = useState(0);
  const [isFadingToBlack, setIsFadingToBlack] = useState(false);
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);
  const hasTransitionedRef = useRef(false);

  // Status & loading
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Media refs & states
  const introVideoRef = useRef<HTMLVideoElement>(null);

  // Video URL specified in user brief
  const eyeIntroVideoUrl =
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260922_195107_ed3f055a-3a13-4a71-b743-e10310454246.mp4';

  const transitionToSignIn = useCallback(() => {
    if (hasTransitionedRef.current) return;
    hasTransitionedRef.current = true;

    setIsFadingToBlack(true);

    if (introVideoRef.current) {
      try {
        introVideoRef.current.pause();
      } catch {
        // Safe ignore
      }
    }

    setTimeout(() => {
      setStage('signin');
      setIsFadingToBlack(false);
    }, 420);
  }, []);

  useEffect(() => {
    if (stage !== 'loading') return;

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 12) + 8;
      if (progress >= 100) {
        progress = 100;
        setLoadProgress(100);
        clearInterval(interval);

        setTimeout(() => {
          setStage('intro');
        }, 350);
      } else {
        setLoadProgress(progress);
      }
    }, 90);

    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'intro') return;

    const video = introVideoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const applyPlaybackRate = () => {
      try {
        video.playbackRate = 2.0;
      } catch {
        // Safe ignore if unsupported
      }
    };

    if (video.currentTime > 0.05) {
      try {
        video.currentTime = 0;
      } catch {
        // Safe ignore
      }
    }

    applyPlaybackRate();

    const handlePlaying = () => {
      applyPlaybackRate();
    };

    const handleTimeUpdate = () => {
      applyPlaybackRate();
      if (video.duration && video.duration - video.currentTime <= 0.35) {
        transitionToSignIn();
      }
    };

    const handleEnded = () => {
      transitionToSignIn();
    };

    const handleError = () => {
      console.warn('Eye intro video error, skipping to sign-in');
      transitionToSignIn();
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Autoplay prevented:', err);
      });
    }

    const safetyTimeout = setTimeout(() => {
      transitionToSignIn();
    }, 12000);

    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      clearTimeout(safetyTimeout);
    };
  }, [stage, transitionToSignIn]);

  // Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const user = await signInWithGoogle();
      onAuthenticated(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || msg.includes('popup-closed-by-user')) {
        console.warn('Google Sign-In was cancelled or popup closed.');
        setErrorMessage('Sign-in popup was closed. Please try again.');
      } else if (code === 'auth/popup-blocked' || msg.includes('popup-blocked')) {
        console.warn('Google Sign-In popup was blocked by browser.');
        setErrorMessage('Popup was blocked by your browser. Please allow popups for this site.');
      } else {
        console.error('Google Sign-In failed:', err);
        setErrorMessage('Google authentication could not be completed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-sky-canvas select-none font-dm">
      {/* =========================================================
          STAGE ONE: IRIS AI LOADING SCREEN (#splash)
          ========================================================= */}
      {stage === 'loading' && (
        <div
          id="splash"
          className="fixed inset-0 z-50 bg-sky-canvas flex flex-col items-center justify-center p-6 transition-opacity duration-500"
        >
          <div className="flex flex-col items-center gap-4 mb-8">
            <OrbitingEyeLogo size={80} className="w-20 h-20" />
            <h1 className="font-cormorant text-3xl sm:text-4xl font-bold tracking-tight">
              IRIS
            </h1>
          </div>

          <div
            className={`w-[190px] sm:w-[220px] h-3 rounded-full overflow-hidden mb-4 relative ${
              isMinimal
                ? isDark
                  ? 'bg-white/[0.10] border border-white/[0.16]'
                  : 'bg-white/80 border border-white/95'
                : isDark
                ? 'bg-[#1F1F1F] border-2 border-[#F5F5F0]'
                : 'bg-white border-2 border-black'
            }`}
          >
            <div
              className={`h-full transition-all duration-150 ease-out rounded-full ${
                isMinimal
                  ? isDark
                    ? 'bg-[var(--theme-accent,#FF7A1A)]'
                    : 'bg-[var(--theme-accent,#7B5CD6)]'
                  : isDark
                  ? 'bg-[var(--vivid-accent,#D4FF3F)]'
                  : 'bg-[#FF851B]'
              }`}
              style={{ width: `${loadProgress}%` }}
            />
          </div>

          <p className="text-[11px] font-dm font-bold tracking-[0.28em] opacity-80 uppercase">
            CLEAR VISION &middot; CALM FOCUS
          </p>
        </div>
      )}

      {/* =========================================================
          STAGE TWO: CINEMATIC EYE-TRAVERSAL VIDEO (#intro)
          ========================================================= */}
      {stage === 'intro' && (
        <div
          id="intro"
          className={`fixed inset-0 z-40 bg-black overflow-hidden flex items-center justify-center transition-opacity duration-500 ${
            isFadingToBlack ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <video
            id="film"
            ref={introVideoRef}
            src={eyeIntroVideoUrl}
            autoPlay
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            className="w-full h-full object-cover pointer-events-none"
          />

          <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 z-50">
            <button
              id="skip"
              type="button"
              onClick={transitionToSignIn}
              className="min-h-[44px] min-w-[44px] px-5 py-2 pill-secondary text-xs tracking-widest uppercase font-dm font-extrabold flex items-center justify-center cursor-pointer"
              aria-label="Skip cinematic introduction"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {isFadingToBlack && (
        <div className="fixed inset-0 z-45 bg-sky-canvas pointer-events-none transition-opacity duration-300" />
      )}

      {/* =========================================================
          STAGE THREE: IRIS AI SIGN-IN PAGE (GOOGLE ONLY)
          ========================================================= */}
      {stage === 'signin' && (
        <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-sky-canvas">
          {/* Top-Right Independent Light/Dark Toggle + Paintbrush Style Switcher */}
          <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-30 flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleColorMode}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full glass-nav-pill font-dm text-xs font-bold cursor-pointer"
              title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
              aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
            >
              {isDark ? (
                <Moon className={`w-4 h-4 ${isMinimal ? 'text-[var(--theme-accent,#FF7A1A)]' : 'text-[#D4FF3F]'}`} />
              ) : (
                <Sun className={`w-4 h-4 ${isMinimal ? 'text-[var(--theme-accent,#7B5CD6)]' : 'text-[#FF851B]'}`} />
              )}
              <span className="capitalize">{colorMode}</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStyleDropdown(!showStyleDropdown)}
                className="flex items-center gap-2 px-4 py-2 rounded-full glass-nav-pill font-dm text-xs font-bold cursor-pointer"
                title="Choose interface style (Minimal or Vivid)"
                aria-label="Choose interface style (Minimal or Vivid)"
              >
                <Paintbrush className="w-4 h-4" />
                <span className="capitalize">{styleMode}</span>
              </button>

              {showStyleDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setShowStyleDropdown(false)}
                  />
                  <div className="absolute right-0 mt-2 w-60 glass-modal p-3 z-50 animate-dropdown-enter flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setStyleMode('minimal');
                        setShowStyleDropdown(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                        styleMode === 'minimal'
                          ? isDark
                            ? 'bg-white/[0.10] border border-[var(--theme-accent,#FF7A1A)]/55 text-[#F5EDE4] font-semibold'
                            : 'bg-white border border-[#7B5CD6]/45 shadow-xs text-[#0F172A] font-semibold'
                          : 'hover:bg-white/10 text-current'
                      }`}
                    >
                      <div>
                        <span
                          className="text-sm font-semibold block leading-tight"
                          style={{ fontFamily: "'EB Garamond', Georgia, serif" }}
                        >
                          Minimal
                        </span>
                        <span className="font-dm text-[11px] opacity-75 block">
                          {isDark ? 'Warm espresso & dark glass' : 'Sky-blue & frosted white glass'}
                        </span>
                      </div>
                      {styleMode === 'minimal' && (
                        <Check className={`w-4 h-4 ${isDark ? 'text-[var(--theme-accent,#FF7A1A)]' : 'text-[#7B5CD6]'}`} />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setStyleMode('vivid');
                        setShowStyleDropdown(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                        styleMode === 'vivid'
                          ? isDark
                            ? 'bg-[var(--vivid-accent,#D4FF3F)] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] text-[var(--vivid-accent-fg,#0D0D0D)] font-extrabold'
                            : 'bg-[#FFD84D] border-2 border-black shadow-[2px_2px_0px_#000000] text-black font-extrabold'
                          : 'hover:bg-white/10 text-current'
                      }`}
                    >
                      <div>
                        <span className="font-cormorant text-sm font-bold block leading-tight">
                          Vivid
                        </span>
                        <span className="font-dm text-[11px] opacity-80 block">
                          Tactile color-block cards
                        </span>
                      </div>
                      {styleMode === 'vivid' && <Check className="w-4 h-4 text-current" />}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Centered Sign-In Card */}
          <div className="relative z-10 w-full max-w-[430px] rounded-[28px] tactile-card-yellow p-7 sm:p-9 flex flex-col items-center my-auto animate-iris-card">
            <div className="mb-4">
              <OrbitingEyeLogo
                size={64}
                className="w-16 h-16 animate-iris-emblem"
                surface={isMinimal && isDark ? 'dark' : 'light'}
              />
            </div>

            <h1 className="font-cormorant text-3xl sm:text-4xl font-bold tracking-tight text-center mb-6">
              Welcome to IRIS
            </h1>

            {errorMessage && (
              <div className="w-full mb-5 px-3.5 py-2.5 rounded-[18px] bg-[#FF851B] border-2 border-black text-black font-extrabold text-xs text-center font-dm shadow-[2px_2px_0px_#000000]">
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full h-12 px-6 rounded-full btn-pill-primary text-sm flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="tracking-tight font-bold">Sign in with Google</span>
                </>
              )}
            </button>

            <p className="mt-5 text-[11px] opacity-75 text-center leading-relaxed">
              By signing in with Google, you agree to our Terms of Service and Privacy Policy. Camera processing executes locally on this device.
            </p>
          </div>

          <div className="fixed bottom-4 right-4 z-20">
            <button
              type="button"
              onClick={() => {
                hasTransitionedRef.current = false;
                setStage('loading');
                setLoadProgress(0);
              }}
              className="px-4 py-2 pill-secondary text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
              title="Replay IRIS eye introduction"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Replay Intro</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
