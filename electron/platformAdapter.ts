import fs from 'fs';
import path from 'path';

export type PlatformEnvironment = 'windows' | 'wine' | 'proton';

export interface PlatformConfig {
  platform: PlatformEnvironment;
  isWineOrProton: boolean;
  isWindowsNative: boolean;
  appliedSwitches: string[];
}

/**
 * Detect runtime platform environment: Windows Native, Wine, or Proton
 */
export function detectPlatformEnvironment(): PlatformEnvironment {
  // Check Steam Proton environment markers
  if (process.env.PROTON_VERSION || process.env.STEAM_COMPAT_DATA_PATH) {
    return 'proton';
  }

  // Check Wine environment variables
  if (
    process.env.WINEPREFIX ||
    process.env.WINELOADER ||
    process.env.WINEUSERNAME ||
    process.env.WINEDLLOVERRIDES
  ) {
    return 'wine';
  }

  // Check mapped Linux proc filesystem under Wine/Proton (drive Z: or /proc)
  try {
    const wineProcPaths = ['Z:\\proc\\version', '/proc/version'];
    for (const p of wineProcPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8').toLowerCase();
        if (content.includes('valve') || content.includes('proton') || content.includes('steam')) {
          return 'proton';
        }
        return 'wine';
      }
    }
  } catch {
    // Ignore filesystem read errors in restricted sandboxes
  }

  // Check ntdll export wine_get_version if on win32
  if (process.platform === 'win32') {
    try {
      const koffi = require('koffi');
      const ntdll = koffi.load('ntdll.dll');
      const wine_get_version = ntdll.func('const char* wine_get_version()');
      if (wine_get_version) {
        return 'wine';
      }
    } catch {
      // Expected on native Windows
    }
    return 'windows';
  }

  // Default fallback if running under Linux
  return process.platform === 'linux' ? 'wine' : 'windows';
}

/**
 * Configure Chromium flags for Electron's app instance.
 * Ensures MediaPipe continuous background vision without timer throttling
 * and handles Wine/Proton multimedia/graphics driver fallbacks.
 */
export function configureChromiumSwitches(app?: any): PlatformConfig {
  const platform = detectPlatformEnvironment();
  const isWineOrProton = platform === 'wine' || platform === 'proton';
  const isWindowsNative = platform === 'windows';
  const appliedSwitches: string[] = [];

  const addSwitch = (name: string, value?: string) => {
    appliedSwitches.push(value !== undefined ? `${name}=${value}` : name);
    if (app?.commandLine?.appendSwitch) {
      if (value !== undefined) {
        app.commandLine.appendSwitch(name.replace(/^--/, ''), value);
      } else {
        app.commandLine.appendSwitch(name.replace(/^--/, ''));
      }
    }
  };

  // 1. Mandatory switches for ALL platforms (prevents background vision freezes & AppContainer permission aborts)
  addSwitch('--disable-background-timer-throttling');
  addSwitch('--disable-renderer-backgrounding');
  addSwitch('--disable-backgrounding-occluded-windows');
  addSwitch('--disable-features', 'CalculateNativeWinOcclusion');
  addSwitch('--no-sandbox');
  addSwitch('--disable-gpu-sandbox');

  // 2. Linux Driver Alternatives & Wine/Proton compatibility switches
  if (isWineOrProton) {
    // Disable Windows Media Foundation video capture to force V4L2/DirectShow compatibility
    addSwitch(
      '--disable-features',
      'MediaFoundationVideoCapture,MediaFoundationD3D11VideoCapture,CalculateNativeWinOcclusion'
    );
    addSwitch('--enable-features', 'V4L2FlatColorSpace');

    // Audio buffering for PulseAudio / PipeWire ALSA emulation layers
    addSwitch('--disable-audio-hardware-checking');
    addSwitch('--audio-buffer-size', '2048');

    // Graphics & compositor adaptation (avoids DirectComposition crashes under Wine/DXVK)
    addSwitch('--disable-direct-composition');
    addSwitch('--use-gl', 'angle');
    addSwitch('--use-angle', 'vulkan');
    addSwitch('--ignore-gpu-blocklist');

    // Sandbox handling under Wine / Proton / Root container runtimes
    addSwitch('--no-sandbox');
    addSwitch('--disable-gpu-sandbox');
    addSwitch('--disable-setuid-sandbox');
  }

  return {
    platform,
    isWineOrProton,
    isWindowsNative,
    appliedSwitches,
  };
}
