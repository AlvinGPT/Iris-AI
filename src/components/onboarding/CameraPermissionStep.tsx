import React from 'react';
import { Camera, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { CameraPermissionState } from '../../types';
import { OnboardingDesignTokens } from './onboardingTheme';

interface CameraPermissionStepProps {
  permissionState: CameraPermissionState;
  isStreamActive: boolean;
  errorMessage?: string;
  recoveryReason?: string;
  onEnableCamera: () => void;
  onContinue: () => void;
  tokens: OnboardingDesignTokens;
}

export const CameraPermissionStep: React.FC<CameraPermissionStepProps> = ({
  permissionState,
  isStreamActive,
  errorMessage,
  recoveryReason,
  onEnableCamera,
  onContinue,
  tokens,
}) => {
  const isVivid = tokens.styleMode === 'vivid';
  const isReady = permissionState === 'Permission granted' && isStreamActive;
  const isRequesting = permissionState === 'Requesting permission';
  const isErrorState =
    permissionState === 'Permission denied' ||
    permissionState === 'Camera unavailable' ||
    permissionState === 'Camera in use by another application' ||
    permissionState === 'Camera initialization failed';

  return (
    <section
      aria-labelledby="camera-permission-heading"
      className={`w-full max-w-xl mx-auto p-7 sm:p-10 flex flex-col motion-safe:transition-opacity motion-safe:duration-200 ${tokens.panelCard}`}
    >
      {recoveryReason && (
        <div
          role="note"
          className={`mb-5 px-4 py-3 text-xs sm:text-sm ${tokens.warningCallout}`}
        >
          {recoveryReason}
        </div>
      )}

      <div className="mb-6">
        <h1
          id="camera-permission-heading"
          className={`${tokens.headingFont} ${
            isVivid ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
          } mb-2.5`}
        >
          Let’s check your camera
        </h1>
        <p
          className={`${tokens.bodyFont} text-sm sm:text-base ${
            isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#334155]'
          } leading-relaxed`}
        >
          IRIS uses your camera to detect your face, locate your eyes, and measure screen-awareness patterns while monitoring is enabled.
        </p>
      </div>

      {/* Explicit Real Camera Status Readout */}
      <div
        role="status"
        aria-live="polite"
        className={`p-4 sm:p-5 mb-6 flex items-start gap-3.5 ${
          isReady
            ? tokens.successCallout
            : isErrorState
            ? tokens.warningCallout
            : tokens.subCard
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {isReady ? (
            <CheckCircle2
              className={`w-5 h-5 ${
                isVivid ? 'text-black dark:text-[#25D6C1]' : 'text-[#0D9488]'
              }`}
              aria-hidden="true"
            />
          ) : isErrorState ? (
            <AlertCircle
              className={`w-5 h-5 ${
                isVivid ? 'text-black dark:text-[#FF851B]' : 'text-[#B45309]'
              }`}
              aria-hidden="true"
            />
          ) : (
            <Camera
              className={`w-5 h-5 ${
                isVivid ? 'text-[var(--fg-primary)]' : 'text-[#0284C7]'
              }`}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div
            className={`flex items-center gap-2 text-xs mb-0.5 ${
              isVivid
                ? isReady || isErrorState
                  ? 'text-black/80 dark:text-white/80 font-bold'
                  : 'text-[var(--fg-muted)] font-bold'
                : 'text-[#475569]'
            }`}
          >
            <span>Camera status</span>
          </div>
          <p
            className={`${tokens.labelFont} text-sm sm:text-base ${
              isVivid && (isReady || isErrorState) ? 'text-black dark:text-white' : ''
            }`}
          >
            {permissionState}
          </p>

          {permissionState === 'Permission not requested' && (
            <p
              className={`${tokens.bodyFont} text-xs sm:text-sm ${
                isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#475569]'
              } mt-1`}
            >
              Click &ldquo;Enable camera&rdquo; below to request camera access from your operating system or browser.
            </p>
          )}

          {permissionState === 'Requesting permission' && (
            <p
              className={`${tokens.bodyFont} text-xs sm:text-sm ${
                isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#475569]'
              } mt-1`}
            >
              Waiting for confirmation in your browser or system prompt. Select &ldquo;Allow&rdquo; when prompted.
            </p>
          )}

          {isReady && (
            <p
              className={`${tokens.bodyFont} text-xs sm:text-sm ${
                isVivid ? 'text-black/90 dark:text-white/90' : 'text-[#115E59]'
              } mt-1`}
            >
              Local camera stream is active and ready for position setup.
            </p>
          )}

          {errorMessage && isErrorState && (
            <p
              className={`${tokens.bodyFont} text-xs sm:text-sm mt-1 ${
                isVivid ? 'text-black dark:text-white' : ''
              }`}
            >
              {errorMessage}
            </p>
          )}
        </div>
      </div>

      {/* Explicit Recovery Guidance for Denied Permission */}
      {permissionState === 'Permission denied' && (
        <div className={`p-4 sm:p-5 mb-6 text-xs sm:text-sm space-y-2.5 ${tokens.subCard}`}>
          <h2 className={`${tokens.labelFont} text-sm`}>
            How to enable camera access in Windows and browser settings
          </h2>
          <ol
            className={`list-decimal list-inside space-y-1.5 ${
              isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#334155]'
            } ${tokens.bodyFont}`}
          >
            <li>
              In <strong>Windows Settings</strong>, open <strong>Privacy &amp; security &rarr; Camera</strong> and ensure both <em>Camera access</em> and <em>Let desktop apps access your camera</em> are turned <strong>On</strong>.
            </li>
            <li>
              In your browser address bar, select the site permissions icon next to the URL and set <strong>Camera</strong> to <strong>Allow</strong>.
            </li>
            <li>
              Select <strong>Try again</strong> below once access is enabled.
            </li>
          </ol>
        </div>
      )}

      {/* Explicit Recovery Guidance for Camera In Use by Another Application */}
      {permissionState === 'Camera in use by another application' && (
        <div className={`p-4 sm:p-5 mb-6 text-xs sm:text-sm space-y-2 ${tokens.subCard}`}>
          <h2 className={`${tokens.labelFont} text-sm`}>
            Release the camera in other applications
          </h2>
          <p
            className={`${tokens.bodyFont} ${
              isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#334155]'
            } leading-relaxed`}
          >
            Another application (such as Zoom, Microsoft Teams, Google Meet, or the Windows Camera app) is currently holding access to your camera. Close or turn off the camera in that application before retrying.
          </p>
        </div>
      )}

      {/* Explicit Recovery Guidance for Camera Unavailable or Initialization Failed */}
      {(permissionState === 'Camera unavailable' ||
        permissionState === 'Camera initialization failed') && (
        <div className={`p-4 sm:p-5 mb-6 text-xs sm:text-sm space-y-2 ${tokens.subCard}`}>
          <h2 className={`${tokens.labelFont} text-sm`}>
            Troubleshooting camera initialization
          </h2>
          <p
            className={`${tokens.bodyFont} ${
              isVivid ? 'text-[var(--fg-secondary)]' : 'text-[#334155]'
            } leading-relaxed`}
          >
            Verify that your webcam is connected, any physical privacy shutter is open, and your camera is enabled in Windows Device Manager, then select <strong>Try again</strong>.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        {!isReady ? (
          <button
            type="button"
            disabled={isRequesting}
            onClick={onEnableCamera}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 text-sm sm:text-base ${
              isRequesting ? tokens.primaryButtonDisabled : tokens.primaryButton
            }`}
          >
            {isErrorState ? (
              <>
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                <span>Try again</span>
              </>
            ) : (
              <span>{isRequesting ? 'Requesting permission…' : 'Enable camera'}</span>
            )}
          </button>
        ) : (
          <div
            className={`text-xs sm:text-sm font-medium ${
              isVivid ? 'font-dm font-bold text-[var(--fg-primary)]' : 'text-[#0D9488]'
            }`}
          >
            Camera stream verified
          </div>
        )}

        <button
          type="button"
          disabled={!isReady}
          onClick={() => {
            if (isReady) {
              onContinue();
            }
          }}
          className={`w-full sm:w-auto min-w-[160px] text-sm sm:text-base ${
            isReady ? tokens.primaryButton : tokens.primaryButtonDisabled
          }`}
        >
          Continue
        </button>
      </div>
    </section>
  );
};
