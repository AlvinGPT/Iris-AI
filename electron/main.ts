import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, session, shell, net, screen, dialog, type NativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { exec, execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { configureChromiumSwitches, detectPlatformEnvironment } from './platformAdapter.ts';
import { configureProcessPriority, restoreProcessPriority } from './ecoQoS.ts';
import { getFirebaseApiKey, getGeminiApiKey, saveToVault, readFromVault } from './securityVault.ts';
import { startServer, stopServer, IrisServerInstance } from '../server.ts';

if (app.isPackaged || !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Ensure GEMINI_API_KEY from .env or security vault is resolved and injected into process.env
try {
  const possibleEnvFiles = [
    path.join(process.cwd(), '.env'),
    path.join(app.getAppPath(), '.env'),
    path.join(path.dirname(app.getPath('exe')), '.env'),
  ];
  for (const envF of possibleEnvFiles) {
    if (fs.existsSync(envF)) {
      try {
        const text = fs.readFileSync(envF, 'utf8');
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eq = trimmed.indexOf('=');
            if (eq > 0) {
              const k = trimmed.substring(0, eq).trim();
              const v = trimmed.substring(eq + 1).replace(/^['"]|['"]$/g, '').trim();
              if (k && v && !process.env[k]) {
                process.env[k] = v;
              }
            }
          }
        }
      } catch {}
    }
  }

  const resolvedGemini = getGeminiApiKey();
  if (resolvedGemini && resolvedGemini.length > 10) {
    process.env.GEMINI_API_KEY = resolvedGemini;
    process.env.VITE_GEMINI_API_KEY = resolvedGemini;
  }
} catch (envErr) {
  console.error('[IRIS] Failed initializing Gemini key in main.ts:', envErr);
}

const getScriptDir = (): string => {
  try {
    if (typeof __dirname !== 'undefined' && __dirname) return __dirname;
    if (typeof import.meta?.url === 'string') {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {}
  return process.cwd();
};
const appDir = getScriptDir();

// Strip Electron and app identifiers globally from user-agent fallback to bypass Google OAuth 403 disallowed_useragent
const rawUserAgent = app.userAgentFallback || '';
const cleanUserAgent = rawUserAgent
  .replace(/Electron\/[^\s]+\s?/gi, '')
  .replace(/IRIS\/[^\s]+\s?/gi, '')
  .trim() || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

try {
  app.userAgentFallback = cleanUserAgent;
} catch {}

// Persistent startup and diagnostic logger to prevent silent exits
export function logStartup(msg: string) {
  try {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    const localLog = path.join(process.cwd(), 'startup-error.log');
    fs.appendFileSync(localLog, line);
    try {
      const userLog = path.join(app.getPath('userData'), 'startup-error.log');
      fs.appendFileSync(userLog, line);
    } catch {}
    console.log(`[IRIS Startup] ${msg}`);
  } catch {}
}

process.on('uncaughtException', (err) => {
  try {
    const stack = err?.stack || err?.toString() || 'Unknown error';
    fs.appendFileSync(path.join(process.cwd(), 'startup-error.log'), `[${new Date().toISOString()}] [FATAL uncaughtException] ${stack}\n`);
    logStartup(`Uncaught Exception in Main Process: ${stack}`);
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  try {
    const stack = (reason as any)?.stack || reason?.toString() || 'Unknown rejection';
    fs.appendFileSync(path.join(process.cwd(), 'startup-error.log'), `[${new Date().toISOString()}] [FATAL unhandledRejection] ${stack}\n`);
    logStartup(`Unhandled Rejection in Main Process: ${stack}`);
  } catch {}
});

// 1. Configure platform driver alternatives and background switches before app is ready
const platform = detectPlatformEnvironment();
const isWineOrProton = platform === 'wine' || platform === 'proton';
try {
  configureChromiumSwitches(app);
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  // Safe background media and timer flags
  app.commandLine.appendSwitch('disable-background-media-suspend');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
} catch (err) {
  logStartup(`configureChromiumSwitches error: ${err}`);
}

// 2. Enforce single-instance lock for low-impact background daemon
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logStartup('Another instance of IRIS already holds the lock. Quitting duplicate instance.');
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let edgeOverlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverInstance: IrisServerInstance | null = null;
let isQuitting = false;

type IrisBehaviorMode = 'default' | 'gaming' | 'meeting';
let currentActiveMode: IrisBehaviorMode = 'default';
let latestTelemetryData: any = null;
let widgetSavedPosition: { x: number; y: number } | null = null;

let currentWidgetDesign: 'liquid-glass' | 'dark-vivid' = 'dark-vivid';

function getWidgetConfigPath(): string {
  return path.join(app.getPath('userData'), 'widget-config.json');
}

function loadWidgetConfig(): void {
  try {
    const p = getWidgetConfigPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data.activeMode && ['default', 'gaming', 'meeting'].includes(data.activeMode)) {
        currentActiveMode = data.activeMode;
      }
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        widgetSavedPosition = { x: data.x, y: data.y };
      }
      if (data.widgetDesign === 'liquid-glass' || data.widgetDesign === 'dark-vivid') {
        currentWidgetDesign = data.widgetDesign;
      } else {
        currentWidgetDesign = 'dark-vivid';
      }
    }
  } catch {}
}

function saveWidgetConfig(): void {
  try {
    const p = getWidgetConfigPath();
    const data = {
      activeMode: currentActiveMode,
      x: widgetSavedPosition?.x,
      y: widgetSavedPosition?.y,
      widgetDesign: currentWidgetDesign,
    };
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

export interface DisplayScaleInfo {
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
  pillWidth: number;
  pillHeight: number;
  cardWidth: number;
  cardHeight: number;
  edgeBlurPx: number;
  edgeSpreadPx: number;
}

function calculateDisplayResponsiveScale(display: Electron.Display): DisplayScaleInfo {
  const { width, height } = display.workArea;
  const diagonal = Math.sqrt(width * width + height * height);
  const baselineDiagonal = Math.sqrt(1920 * 1920 + 1080 * 1080);
  const rawRatio = diagonal / baselineDiagonal;
  const scale = Number(Math.min(1.45, Math.max(0.82, rawRatio)).toFixed(3));

  return {
    scale,
    canvasWidth: Math.round(380 * scale),
    canvasHeight: Math.round(220 * scale),
    pillWidth: Math.round(204 * scale),
    pillHeight: Math.round(48 * scale),
    cardWidth: Math.round(330 * scale),
    cardHeight: Math.round(180 * scale),
    edgeBlurPx: Math.round(45 * scale),
    edgeSpreadPx: Math.round(15 * scale),
  };
}
let currentEcoQoSResult = { tier: 2, mode: 'win-priority-fallback', success: false, details: 'Initializing' } as any;

const GOOGLE_DESKTOP_CLIENT_ID = '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com';

(global as any).notifyDesktopAuthSuccess = (userPayload: any) => {
  logStartup(`[OAuth] notifyDesktopAuthSuccess received for ${userPayload?.email}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('iris:auth-desktop-success', userPayload);
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
};

try {
  currentEcoQoSResult = configureProcessPriority(isWineOrProton);
} catch (err) {
  logStartup(`Initial configureProcessPriority warning: ${err}`);
}

const isStartedHidden = process.argv.includes('--hidden');

app.on('second-instance', async () => {
  logStartup('Second instance launch signal received. Restoring, showing, and focusing main window.');
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
  } else {
    logStartup('mainWindow absent on second-instance. Creating and displaying mainWindow.');
    try {
      const distPath = resolveAppDistPath();
      const preloadPath = resolvePreloadPath();
      await createWindow(distPath, serverInstance?.port || 3000, true, preloadPath);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.moveTop();
      }
    } catch (err) {
      logStartup(`Error recreating mainWindow on second-instance: ${err}`);
    }
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.show();
  }
});

function resolveAppIcon(): NativeImage {
  const iconCandidates = [
    path.join(appDir, '../public/assets/icon.ico'),
    path.join(process.cwd(), 'public/assets/icon.ico'),
    path.join(appDir, 'public/assets/icon.ico'),
    path.join(appDir, '../public/iris-logo.png'),
    path.join(process.cwd(), 'public/iris-logo.png'),
    path.join(appDir, 'public/iris-logo.png'),
    path.join(appDir, '../public/assets/iris-emblem-black-512.png'),
    path.join(process.cwd(), 'public/assets/iris-emblem-black-512.png'),
    path.join(appDir, 'public/assets/iris-emblem-black-512.png'),
  ];

  for (const candidate of iconCandidates) {
    if (fs.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) {
        return img;
      }
    }
  }
  return nativeImage.createEmpty();
}

function resolveTrayIcon(): NativeImage {
  const iconCandidates = [
    path.join(appDir, '../public/assets/icon.ico'),
    path.join(process.cwd(), 'public/assets/icon.ico'),
    path.join(appDir, 'public/assets/icon.ico'),
    path.join(appDir, '../public/iris-logo.png'),
    path.join(process.cwd(), 'public/iris-logo.png'),
    path.join(appDir, 'public/iris-logo.png'),
    path.join(appDir, '../public/assets/iris-emblem-black-32.png'),
    path.join(process.cwd(), 'public/assets/iris-emblem-black-32.png'),
    path.join(appDir, '../public/assets/iris-emblem-black-16.png'),
    path.join(appDir, '../public/assets/iris-emblem-white-32.png'),
  ];

  for (const candidate of iconCandidates) {
    if (fs.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) {
        return img.resize({ width: 16, height: 16 });
      }
    }
  }
  const buffer = Buffer.alloc(16 * 16 * 4, 255);
  return nativeImage.createFromBuffer(buffer, { width: 16, height: 16 });
}

function updateTrayContextMenu() {
  if (!tray) return;

  const isBootEnabled = app.getLoginItemSettings().openAtLogin;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open IRIS AI Studio',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          restoreProcessPriority();
        }
      },
    },
    {
      label: 'Monitoring: Active Background Daemon',
      enabled: false,
    },
    {
      label: `EcoQoS: Tier ${currentEcoQoSResult.tier} (${currentEcoQoSResult.mode})`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Start on System Boot',
      type: 'checkbox',
      checked: isBootEnabled,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          args: ['--hidden'],
        });
        updateTrayContextMenu();
      },
    },
    {
      label: 'Hide to System Tray',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
          currentEcoQoSResult = configureProcessPriority(isWineOrProton);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit IRIS',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  try {
    const icon = resolveTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('IRIS AI Studio - Low-Impact Vision Daemon');

    updateTrayContextMenu();

    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
          mainWindow.show();
          mainWindow.focus();
          restoreProcessPriority();
        } else {
          mainWindow.focus();
        }
      }
    });

    tray.on('double-click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
          currentEcoQoSResult = configureProcessPriority(isWineOrProton);
        } else {
          mainWindow.show();
          mainWindow.focus();
          restoreProcessPriority();
        }
      }
    });
    logStartup('System tray created and event listeners attached.');
  } catch (err) {
    logStartup(`createTray error: ${err}`);
    console.error('[IRIS] createTray error:', err);
  }
}

function resolveAppDistPath(): string {
  if (process.env.IRIS_DIST_PATH && fs.existsSync(path.join(process.env.IRIS_DIST_PATH, 'index.html'))) {
    return process.env.IRIS_DIST_PATH;
  }
  const candidates = [
    path.join(app.getAppPath(), 'dist'),
    path.join(appDir, '../dist'),
    path.join(appDir, 'dist'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist'),
    path.join(process.resourcesPath || '', 'dist'),
    path.join(process.cwd(), 'dist'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, 'index.html'))) {
      return c;
    }
  }
  return path.join(app.getAppPath(), 'dist');
}

function waitForServer(port: number, maxRetries = 50, intervalMs = 150): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;
    const probe = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (attempts >= maxRetries) {
          resolve(false);
        } else {
          setTimeout(probe, intervalMs);
        }
      });
      req.setTimeout(1000, () => {
        req.destroy();
        if (attempts >= maxRetries) {
          resolve(false);
        } else {
          setTimeout(probe, intervalMs);
        }
      });
    };
    probe();
  });
}

function resolvePreloadPath(): string {
  const preloadCandidates = [
    path.join(appDir, 'preload.cjs'),
    path.join(appDir, 'electron/preload.cjs'),
    path.join(process.cwd(), 'dist-electron/preload.cjs'),
    path.join(process.cwd(), 'electron/preload.cjs'),
  ];
  for (const p of preloadCandidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return path.join(appDir, 'preload.cjs');
}

function updateEdgeOverlayAlertState(): void {
  if (!edgeOverlayWindow || edgeOverlayWindow.isDestroyed()) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleInfo = calculateDisplayResponsiveScale(primaryDisplay);

  const isTracking = latestTelemetryData?.isTracking ?? latestTelemetryData?.isMonitoring ?? false;
  if (currentActiveMode !== 'gaming' || !isTracking) {
    edgeOverlayWindow.webContents.send('iris:edge-overlay-update', {
      active: false,
      type: 'none',
      activeMode: currentActiveMode,
      blinkAlert: false,
      distanceAlert: false,
      blinkRate: null,
      screenDistance: null,
      scaleInfo,
    });
    return;
  }

  const blinkVal = latestTelemetryData?.blinkRate;
  const distVal = latestTelemetryData?.screenDistance;
  const reqBlinks = Number(latestTelemetryData?.requiredBlinks ?? 0);
  const isExplicitBlink = Boolean(latestTelemetryData?.isBlinkAlert);
  const isExplicitDist = Boolean(latestTelemetryData?.isDistanceAlert || latestTelemetryData?.isTooClose);

  const isBlinkCritical = isExplicitBlink || reqBlinks > 0 || (typeof blinkVal === 'number' && blinkVal > 0 && blinkVal < 15);
  const isDistCritical = isExplicitDist || (typeof distVal === 'number' && distVal > 0 && distVal < 38);

  let alertType: 'none' | 'blink' | 'distance' | 'both' = 'none';
  if (isBlinkCritical && isDistCritical) {
    alertType = 'both';
  } else if (isBlinkCritical) {
    alertType = 'blink';
  } else if (isDistCritical) {
    alertType = 'distance';
  }

  edgeOverlayWindow.webContents.send('iris:edge-overlay-update', {
    active: alertType !== 'none',
    type: alertType,
    activeMode: currentActiveMode,
    blinkAlert: isBlinkCritical,
    distanceAlert: isDistCritical,
    blinkRate: blinkVal,
    screenDistance: distVal,
    scaleInfo,
  });
}

let autoModeTimer: NodeJS.Timeout | null = null;
let lastManualModeChangeTime = 0;
let autoDetectedMode: IrisBehaviorMode | null = null;
let isManualModeOverride = false;
let manualSelectedMode: IrisBehaviorMode | null = null;

const GAME_PROCESS_NAMES = [
  'steam.exe',
  'steamwebhelper.exe',
  'epicgameslauncher.exe',
  'valorant.exe',
  'riotclientservices.exe',
  'cs2.exe',
  'csgo.exe',
  'dota2.exe',
  'leagueclient.exe',
  'league of legends.exe',
  'overwatch.exe',
  'minecraft.exe',
  'javaw.exe',
  'fortniteclient-win64-shipping.exe',
  'genshinimpact.exe',
  'r5pc_r5launch_shipping.exe',
  'cyberpunk2077.exe',
  'gta5.exe',
  'robloxplayerbeta.exe',
];

const MEETING_PROCESS_NAMES = [
  'zoom.exe',
  'teams.exe',
  'ms-teams.exe',
  'slack.exe',
  'webex.exe',
  'webexmta.exe',
  'skype.exe',
  'discord.exe',
];

const MEETING_WINDOW_KEYWORDS = [
  'google meet',
  'zoom meeting',
  'microsoft teams',
  'webex',
  'skype meeting',
];

function applyBehaviorMode(newMode: IrisBehaviorMode, isAuto = false): void {
  if (currentActiveMode === newMode) return;
  currentActiveMode = newMode;
  saveWidgetConfig();
  logStartup(`Behavior mode changed to "${currentActiveMode}" (auto: ${isAuto})`);

  const primaryDisplay = screen.getPrimaryDisplay();
  const scaleInfo = calculateDisplayResponsiveScale(primaryDisplay);

  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('iris:widget-state-update', {
      mode: currentActiveMode,
      activeMode: currentActiveMode,
      widgetDesign: currentWidgetDesign,
      telemetry: latestTelemetryData,
      responsiveScale: scaleInfo.scale,
    });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('iris:widget-state-update', {
      mode: currentActiveMode,
      activeMode: currentActiveMode,
      telemetry: latestTelemetryData,
      responsiveScale: scaleInfo.scale,
    });
  }

  updateEdgeOverlayAlertState();
}

interface ProcessScanResult {
  hasGame: boolean;
  hasMeeting: boolean;
  activeGameName?: string;
  activeMeetingName?: string;
}

let cachedProcessScan: { timestamp: number; result: ProcessScanResult } | null = null;
const SCAN_CACHE_TTL_MS = 2500;
let isScanInProgress = false;
let consecutiveNonDetectionCount = 0;

const PS_DETECTION_SCRIPT = `
$paths = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam\\NonPackaged\\*'
);
$active = @(Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue | Where-Object {
  $_.LastUsedTimeStop -eq 0 -and $_.PSChildName -notlike '*IRIS*' -and $_.PSChildName -notlike '*electron*'
});
$wc = @($active | Select-Object -ExpandProperty PSChildName);
# Active in-call subprocesses that run ONLY while inside an active meeting call (CptHost for Zoom, airhost, etc.)
# NEVER check Zoom.exe or Teams.exe!
$callProc = @(Get-Process -Name 'CptHost','airhost' -ErrorAction SilentlyContinue | Select-Object -Property ProcessName);
$targets = @('cs2','valorant','VALORANT*','dota2','hl2','minecraft','javaw','FortniteClient*','Roblox*','GTA5','r5apex*','Overwatch*','League*','eldenring','Cyberpunk2077');
$pr = @(Get-Process -Name $targets -ErrorAction SilentlyContinue | Select-Object -Property ProcessName, MainWindowTitle);
@{ wc=$wc; callProc=$callProc; pr=$pr } | ConvertTo-Json -Compress
`;

function scanActiveProcesses(forceRefresh = false): Promise<ProcessScanResult> {
  const now = Date.now();
  if (!forceRefresh && cachedProcessScan && now - cachedProcessScan.timestamp < SCAN_CACHE_TTL_MS) {
    return Promise.resolve(cachedProcessScan.result);
  }

  if (isScanInProgress && cachedProcessScan) {
    return Promise.resolve(cachedProcessScan.result);
  }

  isScanInProgress = true;

  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      isScanInProgress = false;
      return resolve({ hasGame: false, hasMeeting: false });
    }

    try {
      execFile(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', PS_DETECTION_SCRIPT],
        { timeout: 3000, maxBuffer: 512 * 1024, windowsHide: true },
        (err, stdout) => {
          isScanInProgress = false;
          if (err || !stdout) {
            const fallback = cachedProcessScan?.result || { hasGame: false, hasMeeting: false };
            return resolve(fallback);
          }

          try {
            const data = JSON.parse(stdout.trim());
            const wcArr: string[] = Array.isArray(data.wc) ? data.wc : (data.wc ? [String(data.wc)] : []);
            const callProcArr: Array<{ ProcessName?: string }> = Array.isArray(data.callProc)
              ? data.callProc
              : (data.callProc ? [data.callProc] : []);
            const prArr: Array<{ ProcessName?: string; MainWindowTitle?: string }> = Array.isArray(data.pr)
              ? data.pr
              : (data.pr ? [data.pr] : []);

            let hasMeeting = false;
            let activeMeetingName: string | undefined;

            // Condition A: Active webcam hardware stream in Windows ConsentStore (e.g. Zoom, Meet, Teams, Webex)
            if (wcArr.length > 0) {
              hasMeeting = true;
              const rawChild = wcArr[0];
              let friendlyName = rawChild;
              if (/#/.test(rawChild)) {
                const parts = rawChild.split('#');
                const exe = parts[parts.length - 1] || rawChild;
                if (/zoom/i.test(exe)) friendlyName = 'Zoom';
                else if (/chrome/i.test(exe)) friendlyName = 'Google Chrome (Google Meet)';
                else if (/msedge/i.test(exe)) friendlyName = 'Microsoft Edge (Video Call)';
                else if (/teams/i.test(exe)) friendlyName = 'Microsoft Teams';
                else if (/webex/i.test(exe)) friendlyName = 'Cisco Webex';
                else if (/obs/i.test(exe)) friendlyName = 'OBS Studio';
                else friendlyName = exe.replace(/\.exe$/i, '');
              } else if (/windows\.camera/i.test(rawChild)) {
                friendlyName = 'Windows Camera';
              }
              activeMeetingName = friendlyName;
            } else if (callProcArr.length > 0) {
              // Condition B: Active in-call meeting subprocess (e.g. CptHost.exe for Zoom meeting call)
              hasMeeting = true;
              activeMeetingName = 'Zoom Meeting';
            }

            // Check active games
            let hasGame = false;
            let activeGameName: string | undefined;
            const gameProcessesRegex = /cs2|valorant|dota2|hl2|minecraft|javaw|fortnite|roblox|gta5|r5apex|overwatch|league|eldenring|cyberpunk/i;

            for (const p of prArr) {
              const pName = p.ProcessName || '';
              if (gameProcessesRegex.test(pName)) {
                hasGame = true;
                activeGameName = pName;
                break;
              }
            }

            const result: ProcessScanResult = { hasGame, hasMeeting, activeGameName, activeMeetingName };
            cachedProcessScan = { timestamp: Date.now(), result };
            resolve(result);
          } catch {
            resolve(cachedProcessScan?.result || { hasGame: false, hasMeeting: false });
          }
        }
      );
    } catch {
      isScanInProgress = false;
      resolve(cachedProcessScan?.result || { hasGame: false, hasMeeting: false });
    }
  });
}

async function pollActiveAppsForMode(): Promise<void> {
  if (process.platform !== 'win32') return;

  try {
    const scan = await scanActiveProcesses();

    // Broadcast concurrent camera events to mainWindow for live UI badges
    if (scan.hasMeeting) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const meetingPayload = {
          activeMeetingName: scan.activeMeetingName || 'External Video Call',
          isSharedMode: true,
        };
        mainWindow.webContents.send('iris:concurrent-camera-app-detected', meetingPayload);
      }
    } else {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('iris:concurrent-camera-app-cleared');
      }
    }

    // If manual mode override is active, do not overwrite the user's manual mode choice!
    if (isManualModeOverride) {
      return;
    }

    let detected: IrisBehaviorMode | null = null;
    if (scan.hasMeeting) {
      detected = 'meeting';
    } else if (scan.hasGame) {
      detected = 'gaming';
    }

    if (detected) {
      consecutiveNonDetectionCount = 0;
      if (currentActiveMode !== detected) {
        autoDetectedMode = detected;
        applyBehaviorMode(detected, true);
      }
    } else {
      // Neither meeting nor game actively detected: revert to default IMMEDIATELY without delay!
      if (autoDetectedMode && (currentActiveMode === 'gaming' || currentActiveMode === 'meeting')) {
        autoDetectedMode = null;
        consecutiveNonDetectionCount = 0;
        applyBehaviorMode('default', true);
      } else {
        consecutiveNonDetectionCount = 0;
      }
    }
  } catch {}
}

async function createWidgetWindow(distPath: string, serverPort: number, preloadPath: string, isServerReady: boolean = false) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  widgetWindow = new BrowserWindow({
    width: workArea.width,
    height: workArea.height,
    x: workArea.x,
    y: workArea.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });

  widgetWindow.webContents.setBackgroundThrottling(false);
  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  // Initially ignore mouse events on transparent canvas regions outside the pupil widget
  widgetWindow.setIgnoreMouseEvents(true, { forward: true });

  const staticIndexHtml = path.join(distPath, 'index.html');
  try {
    if (fs.existsSync(staticIndexHtml)) {
      await widgetWindow.loadFile(staticIndexHtml, { query: { window: 'widget' } });
    } else {
      await widgetWindow.loadURL(`http://localhost:${serverPort}/?window=widget`);
    }
  } catch (err) {
    logStartup(`widgetWindow load failed: ${err}`);
  }

  widgetWindow.show();
  logStartup('widgetWindow initialized and shown as full-workArea transparent canvas.');

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
}

async function createEdgeOverlayWindow(distPath: string, serverPort: number, preloadPath: string) {
  const primaryDisplay = screen.getPrimaryDisplay();

  edgeOverlayWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });

  edgeOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  edgeOverlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const staticIndexHtml = path.join(distPath, 'index.html');
  try {
    if (fs.existsSync(staticIndexHtml)) {
      await edgeOverlayWindow.loadFile(staticIndexHtml, { query: { window: 'edge-overlay' } });
    } else {
      await edgeOverlayWindow.loadURL(`http://localhost:${serverPort}/?window=edge-overlay`);
    }
  } catch (err) {
    logStartup(`edgeOverlayWindow load failed: ${err}`);
  }

  edgeOverlayWindow.show();
  logStartup('edgeOverlayWindow initialized and shown.');

  edgeOverlayWindow.on('closed', () => {
    edgeOverlayWindow = null;
  });
}

async function createWindow(distPath: string, serverPort: number, isServerReady: boolean, preloadPath = resolvePreloadPath()) {
  // Completely disable top application menu bar (File, Edit, View, Window)
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    show: !isStartedHidden,
    backgroundColor: '#0c0f14',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    icon: resolveAppIcon(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // CRITICAL: Never throttle MediaPipe vision when window is hidden
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setBackgroundThrottling(false);

  mainWindow.once('ready-to-show', () => {
    if (!isStartedHidden && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
      logStartup('mainWindow ready-to-show: displayed and focused.');
    }
  });

  if (!isStartedHidden) {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.moveTop();
        logStartup('mainWindow fallback timeout (1500ms): forced visible.');
      }
    }, 1500);
  }

  // Configure native window opener handler for Firebase signInWithPopup & Google OAuth
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logStartup(`[webContents:setWindowOpenHandler] Opening popup for URL: ${url}`);
    // CRITICAL: Do NOT specify overrideBrowserWindowOptions.webPreferences!
    // Overriding webPreferences isolates the child window and destroys Chromium's native window.opener context for /__/auth/handler.
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        frame: true,
        autoHideMenuBar: true,
        width: 520,
        height: 680,
        center: true,
      },
    };
  });

  mainWindow.webContents.on('did-create-window', (childWindow) => {
    logStartup('[webContents:did-create-window] Child OAuth window spawned.');
    childWindow.setMenuBarVisibility(false);
    if (cleanUserAgent) {
      childWindow.webContents.setUserAgent(cleanUserAgent);
    }
  });

  const staticIndexHtml = path.join(distPath, 'index.html');
  if (fs.existsSync(staticIndexHtml)) {
    logStartup(`Loading application directly from local static bundle: ${staticIndexHtml}`);
    try {
      await mainWindow.loadFile(staticIndexHtml);
    } catch (err) {
      logStartup(`mainWindow.loadFile failed: ${err}, attempting URL.`);
      await mainWindow.loadURL(`http://localhost:${serverPort}`).catch(() => {});
    }
  } else {
    const targetUrl = `http://localhost:${serverPort}`;
    logStartup(`Loading application from fallback URL: ${targetUrl}`);
    try {
      await mainWindow.loadURL(targetUrl);
    } catch (err) {
      logStartup(`mainWindow.loadURL failed: ${err}`);
    }
  }

  if (!isStartedHidden && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
    logStartup('mainWindow shown and focused cleanly on normal launch.');
  } else {
    logStartup('mainWindow initializing GPU video decoding pipeline for silent boot daemon mode (--hidden)...');
    try {
      mainWindow.setOpacity(0);
      mainWindow.setSkipTaskbar(true);
      mainWindow.showInactive();
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && isStartedHidden) {
          mainWindow.hide();
          mainWindow.setOpacity(1);
          logStartup('mainWindow primed GPU video decode and returned to hidden tray mode.');
        }
      }, 350);
    } catch (err) {
      logStartup(`Error priming video decode pipeline in hidden mode: ${err}`);
    }
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logStartup(`Window navigation failed (${errorCode}: ${errorDescription}) URL: ${validatedURL}`);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      try {
        currentEcoQoSResult = configureProcessPriority(isWineOrProton);
      } catch {}
    }
  });

  mainWindow.on('focus', () => {
    try {
      restoreProcessPriority();
    } catch {}
  });

  mainWindow.on('blur', () => {
    try {
      currentEcoQoSResult = configureProcessPriority(isWineOrProton);
    } catch {}
  });
}

function registerIpcHandlers() {
  ipcMain.handle('iris:get-concurrent-camera-status', async () => {
    const scan = await scanActiveProcesses();
    return {
      hasMeeting: scan.hasMeeting,
      activeMeetingName: scan.activeMeetingName || null,
      platform,
      isWindowsNative: platform === 'windows',
      isSharedModeSupported: platform === 'windows',
    };
  });

  ipcMain.handle('iris:get-platform-info', () => {
    return {
      platform,
      isWineOrProton,
      isWindowsNative: platform === 'windows',
      ecoQoS: currentEcoQoSResult,
      driverStack:
        platform === 'windows' ? 'WMF Video + Direct3D11' : 'V4L2 Video + Vulkan/PipeWire',
    };
  });

  ipcMain.handle('iris:get-firebase-credentials', () => {
    return {
      apiKey: getFirebaseApiKey(),
    };
  });

  ipcMain.on('iris:get-firebase-api-key-sync', (event) => {
    event.returnValue = getFirebaseApiKey();
  });

  ipcMain.on('iris:is-started-hidden-sync', (event) => {
    event.returnValue = isStartedHidden;
  });

  ipcMain.handle('iris:is-startup-enabled', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('iris:set-startup-enabled', (_event, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: ['--hidden'],
    });
    updateTrayContextMenu();
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('iris:save-custom-api-key', (_event, key: string) => {
    saveToVault('gemini_api_key', key);
    return true;
  });

  ipcMain.handle('iris:has-configured-api-key', () => {
    const val = readFromVault('gemini_api_key');
    return Boolean(val && val.trim().length > 5);
  });

  ipcMain.handle('iris:toggle-ecoqos', (_event, enabled: boolean) => {
    if (enabled) {
      currentEcoQoSResult = configureProcessPriority(isWineOrProton);
    } else {
      restoreProcessPriority();
      currentEcoQoSResult = {
        tier: 1,
        mode: 'win32-ecoqos',
        success: true,
        details: 'Standard Normal Priority (EcoQoS Paused)',
      };
    }
    updateTrayContextMenu();
    return currentEcoQoSResult;
  });

  ipcMain.handle('iris:minimize-to-tray', () => {
    if (mainWindow) {
      mainWindow.hide();
      currentEcoQoSResult = configureProcessPriority(isWineOrProton);
    }
    return true;
  });

  // Custom Frameless Window Controls (macOS Traffic Light Buttons)
  ipcMain.handle('iris:window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    return true;
  });

  ipcMain.handle('iris:window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.handle('iris:window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
    return true;
  });

  // Google OAuth 2.0 Loopback Desktop Authentication (RFC 8252)
  ipcMain.handle('iris:open-google-login', () => {
    const port = serverInstance?.port || 3000;
    const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_DESKTOP_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('openid email profile')}&prompt=select_account&access_type=offline`;
    logStartup(`[OAuth] Opening Default Browser via shell.openExternal: ${authUrl}`);
    shell.openExternal(authUrl);
    return true;
  });

  ipcMain.handle('iris:focus-main-window', () => {
    logStartup('iris:focus-main-window invoked');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
    }
    return true;
  });

  // Synchronize mode change across windows
  ipcMain.handle('iris:widget-mode-change', (_event, mode: IrisBehaviorMode) => {
    const normMode = String(mode || '').toLowerCase().trim() as IrisBehaviorMode;
    if (['default', 'gaming', 'meeting'].includes(normMode)) {
      isManualModeOverride = true;
      manualSelectedMode = normMode;
      lastManualModeChangeTime = Date.now();
      autoDetectedMode = null;
      consecutiveNonDetectionCount = 0;
      applyBehaviorMode(normMode, false);
    }
    return currentActiveMode;
  });

  // Unrestricted manual mode switching: always allow user choice and cleanly lock manual override
  ipcMain.handle('iris:validate-and-set-mode', async (_event, requestedMode: IrisBehaviorMode) => {
    const normMode = String(requestedMode || '').toLowerCase().trim() as IrisBehaviorMode;
    if (!['default', 'gaming', 'meeting'].includes(normMode)) {
      return { allowed: false, activeMode: currentActiveMode, reason: 'Invalid mode requested.' };
    }

    isManualModeOverride = true;
    manualSelectedMode = normMode;
    lastManualModeChangeTime = Date.now();
    autoDetectedMode = null;
    consecutiveNonDetectionCount = 0;
    applyBehaviorMode(normMode, false);

    return { allowed: true, activeMode: normMode, isManualModeOverride: true };
  });

  // Query mode state including manual override
  ipcMain.handle('iris:get-mode-state', () => {
    return {
      currentActiveMode,
      isManualModeOverride,
      autoDetectedMode,
    };
  });

  // Reset to automatic detection mode
  ipcMain.handle('iris:reset-auto-mode', async () => {
    isManualModeOverride = false;
    manualSelectedMode = null;
    autoDetectedMode = null;
    consecutiveNonDetectionCount = 0;
    await pollActiveAppsForMode();
    return {
      success: true,
      activeMode: currentActiveMode,
      isManualModeOverride: false,
    };
  });

  // Relay blink challenge completion from widget or overlay to mainWindow, widget and overlay
  ipcMain.on('iris:blink-challenge-completed', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('iris:blink-challenge-completed');
    }
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('iris:blink-challenge-completed');
    }
    if (edgeOverlayWindow && !edgeOverlayWindow.isDestroyed()) {
      edgeOverlayWindow.webContents.send('iris:mega-maximize-update', { active: false });
      edgeOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  // Relay live telemetry packet from mainWindow to widget
  ipcMain.on('iris:live-telemetry', (_event, data: any) => {
    latestTelemetryData = data;
    if (data?.activeMode) {
      const norm = String(data.activeMode).toLowerCase().trim() as IrisBehaviorMode;
      if (['default', 'gaming', 'meeting'].includes(norm)) {
        currentActiveMode = norm;
      }
    }
    const primaryDisplay = screen.getPrimaryDisplay();
    const scaleInfo = calculateDisplayResponsiveScale(primaryDisplay);
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('iris:widget-state-update', {
        mode: currentActiveMode,
        activeMode: currentActiveMode,
        widgetDesign: currentWidgetDesign,
        telemetry: latestTelemetryData,
        responsiveScale: scaleInfo.scale,
      });
    }
    updateEdgeOverlayAlertState();
  });

  // Relay instant blink event to widget and edge overlay for blink counter and re-evaluate edge alerts
  ipcMain.on('iris:live-blink-detected', (_event, blinkData?: any) => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('iris:live-blink-detected', blinkData);
    }
    if (edgeOverlayWindow && !edgeOverlayWindow.isDestroyed()) {
      edgeOverlayWindow.webContents.send('iris:live-blink-detected', blinkData);
    }
    updateEdgeOverlayAlertState();
  });

  // Relay Mega Maximize full-screen alert to edgeOverlayWindow
  ipcMain.on('iris:mega-maximize-alert', (_event, data: any) => {
    if (edgeOverlayWindow && !edgeOverlayWindow.isDestroyed()) {
      edgeOverlayWindow.webContents.send('iris:mega-maximize-update', data);
      if (data?.active) {
        edgeOverlayWindow.setIgnoreMouseEvents(false);
      } else {
        edgeOverlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  });

  // Dynamic Island mouse event pass-through toggler (fixed canvas)
  ipcMain.on('iris:widget-ignore-mouse-events', (_event, { ignore, options }: { ignore: boolean; options?: { forward?: boolean } }) => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
    }
  });

  // Dynamic Island window resize from widget (safely preserved for compatibility)
  ipcMain.handle('iris:widget-resize', (_event, _params: { width: number; height: number }) => {
    // Zero-resize strategy: fixed canvas prevents Windows DWM rectangular shadow recalculation
    return true;
  });

  // Move widget window relative to pointer dragging
  ipcMain.on('iris:move-widget-window', (_event, { deltaX, deltaY }: { deltaX: number; deltaY: number }) => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      const [currX, currY] = widgetWindow.getPosition();
      const newX = Math.round(currX + deltaX);
      const newY = Math.round(currY + deltaY);
      widgetWindow.setPosition(newX, newY);
      widgetSavedPosition = { x: newX, y: newY };
      saveWidgetConfig();
    }
  });

  // Save widget position
  ipcMain.on('iris:widget-save-position', (_event, { x, y }: { x: number; y: number }) => {
    widgetSavedPosition = { x, y };
    saveWidgetConfig();
  });

  // Set Pupil widget visual design style ('liquid-glass' | 'dark-vivid')
  ipcMain.handle('iris:widget-set-design', (_event, designStyle: 'liquid-glass' | 'dark-vivid') => {
    if (designStyle === 'liquid-glass' || designStyle === 'dark-vivid') {
      currentWidgetDesign = designStyle;
      saveWidgetConfig();
      if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.webContents.send('iris:widget-design-update', designStyle);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('iris:widget-design-update', designStyle);
      }
      return { success: true, designStyle: currentWidgetDesign };
    }
    return { success: false, designStyle: currentWidgetDesign };
  });

  // Right-click context menu for Pupil floating widget
  ipcMain.on('iris:show-widget-context-menu', (_event, coords?: { x: number; y: number }) => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;

    const isLiquid = currentWidgetDesign === 'liquid-glass';

    const menu = Menu.buildFromTemplate([
      {
        label: isLiquid ? 'Switch to Black Mode' : 'Switch to Liquid Glass',
        click: () => {
          const nextStyle: 'liquid-glass' | 'dark-vivid' = isLiquid ? 'dark-vivid' : 'liquid-glass';
          currentWidgetDesign = nextStyle;
          saveWidgetConfig();
          if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.webContents.send('iris:widget-design-update', nextStyle);
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('iris:widget-design-update', nextStyle);
          }
        },
      },
      { type: 'separator' },
      {
        label: isManualModeOverride ? 'Reset to Auto-Detect Mode' : 'Auto-Detect Mode (Active)',
        type: 'checkbox',
        checked: !isManualModeOverride,
        click: async () => {
          isManualModeOverride = false;
          manualSelectedMode = null;
          autoDetectedMode = null;
          consecutiveNonDetectionCount = 0;
          await pollActiveAppsForMode();
        },
      },
      { type: 'separator' },
      {
        label: 'Normal Mode',
        type: 'radio',
        checked: currentActiveMode === 'default',
        click: () => {
          isManualModeOverride = true;
          manualSelectedMode = 'default';
          lastManualModeChangeTime = Date.now();
          autoDetectedMode = null;
          consecutiveNonDetectionCount = 0;
          applyBehaviorMode('default', false);
        },
      },
      {
        label: 'Gaming Mode',
        type: 'radio',
        checked: currentActiveMode === 'gaming',
        click: () => {
          isManualModeOverride = true;
          manualSelectedMode = 'gaming';
          lastManualModeChangeTime = Date.now();
          autoDetectedMode = null;
          consecutiveNonDetectionCount = 0;
          applyBehaviorMode('gaming', false);
        },
      },
      {
        label: 'Meeting Mode',
        type: 'radio',
        checked: currentActiveMode === 'meeting',
        click: () => {
          isManualModeOverride = true;
          manualSelectedMode = 'meeting';
          lastManualModeChangeTime = Date.now();
          autoDetectedMode = null;
          consecutiveNonDetectionCount = 0;
          applyBehaviorMode('meeting', false);
        },
      },
      { type: 'separator' },
      {
        label: 'Open Main Dashboard',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.moveTop();
          }
        },
      },
      {
        label: 'Close Widget',
        click: () => {
          if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.hide();
          }
        },
      },
    ]);

    const popupOptions: Electron.PopupOptions = { window: widgetWindow };
    if (coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
      popupOptions.x = Math.round(coords.x);
      popupOptions.y = Math.round(coords.y);
    }
    menu.popup(popupOptions);
  });

  // Initial state retrieval
  ipcMain.handle('iris:widget-get-state', () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    const scaleInfo = calculateDisplayResponsiveScale(primaryDisplay);
    const { workArea } = primaryDisplay;
    return {
      mode: currentActiveMode,
      activeMode: currentActiveMode,
      widgetDesign: currentWidgetDesign,
      telemetry: latestTelemetryData,
      scaleInfo,
      responsiveScale: scaleInfo.scale,
      savedPosition: widgetSavedPosition,
      workArea: {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height,
      },
    };
  });
}

// 3. Application Lifecycle
app.whenReady().then(async () => {
  logStartup('app.whenReady() reached.');

  // Automatically grant camera and microphone permissions for vision monitoring
  try {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (permission === 'media' || (permission as string) === 'camera' || (permission as string) === 'microphone') {
        return callback(true);
      }
      callback(false);
    });
    if (cleanUserAgent) {
      session.defaultSession.setUserAgent(cleanUserAgent);
    }
  } catch (err) {
    logStartup(`Permission or session setup warning: ${err}`);
  }

  const distPath = resolveAppDistPath();
  process.env.IRIS_DIST_PATH = distPath;

  const userDataPath = app.getPath('userData');
  process.env.IRIS_USER_DATA = userDataPath;
  const dbPath = path.join(userDataPath, 'iris_telemetry.db');

  registerIpcHandlers();
  createTray();
  loadWidgetConfig();

  const preloadPath = resolvePreloadPath();

  // 1. OPEN WINDOWS IMMEDIATELY — NEVER BLOCK app.whenReady() ON NETWORK OR DAEMON
  let windowInitFailed = false;
  try {
    await createWindow(distPath, 3000, false, preloadPath);
  } catch (err) {
    windowInitFailed = true;
    logStartup(`createWindow error: ${err}`);
    console.error('[IRIS] createWindow error:', err);
  }

  // Force mainWindow visibility immediately unless explicitly launched with --hidden
  if (!isStartedHidden && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
    logStartup('mainWindow forced visible and focused immediately in app.whenReady().');
  }

  // 1500ms fallback timer to guarantee mainWindow is visible
  if (!isStartedHidden) {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.moveTop();
        logStartup('mainWindow 1500ms fallback timer: forced visible.');
      }
    }, 1500);
  }

  // Create Pupil floating widget window immediately
  try {
    await createWidgetWindow(distPath, 3000, preloadPath, false);
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.show();
      logStartup('widgetWindow forced visible in app.whenReady().');
    }
  } catch (err) {
    logStartup(`createWidgetWindow error: ${err}`);
    console.error('[IRIS] createWidgetWindow error:', err);
  }

  // Create Edge overlay window immediately
  try {
    await createEdgeOverlayWindow(distPath, 3000, preloadPath);
  } catch (err) {
    logStartup(`createEdgeOverlayWindow error: ${err}`);
  }

  if (windowInitFailed && (!mainWindow || mainWindow.isDestroyed())) {
    try {
      dialog.showErrorBox(
        'IRIS Startup Notice',
        'IRIS started with limited window capability. The background monitor and system tray remain active.'
      );
    } catch {}
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: ['--hidden'],
    });
  } catch (err) {
    logStartup(`app.setLoginItemSettings error: ${err}`);
  }

  // 2. INITIALIZE EXPRESS DAEMON ASYNCHRONOUSLY IN BACKGROUND (Zero blocking)
  (async () => {
    try {
      const finalGeminiKey = getGeminiApiKey();
      if (finalGeminiKey && finalGeminiKey.length > 10) {
        process.env.GEMINI_API_KEY = finalGeminiKey;
        process.env.VITE_GEMINI_API_KEY = finalGeminiKey;
      }
      logStartup(`Initializing Express daemon asynchronously in background (dist: ${distPath}, db: ${dbPath})...`);
      serverInstance = await startServer({
        port: 3000,
        dbPath,
        distPath,
      });
      logStartup(`Express server daemon active on port ${serverInstance.port}`);
    } catch (err) {
      logStartup(`Express daemon startup error: ${err}`);
    }
  })();

  // 3. Start background app & window polling for automatic Gaming / Meeting mode switching (4s, zero lag)
  try {
    autoModeTimer = setInterval(pollActiveAppsForMode, 4000);
    setTimeout(pollActiveAppsForMode, 2500);
  } catch (err) {
    logStartup(`autoModeTimer setup error: ${err}`);
  }

  screen.on('display-metrics-changed', () => {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      if (edgeOverlayWindow && !edgeOverlayWindow.isDestroyed()) {
        edgeOverlayWindow.setBounds(primaryDisplay.bounds);
      }
      const scaleInfo = calculateDisplayResponsiveScale(primaryDisplay);
      if (widgetWindow && !widgetWindow.isDestroyed()) {
        widgetWindow.setBounds(primaryDisplay.workArea);
        widgetWindow.webContents.send('iris:widget-scale-update', scaleInfo);
      }
      if (edgeOverlayWindow && !edgeOverlayWindow.isDestroyed()) {
        edgeOverlayWindow.webContents.send('iris:edge-scale-update', scaleInfo);
      }
    } catch (err) {
      logStartup(`display-metrics-changed error: ${err}`);
    }
  });

  if (isStartedHidden) {
    try {
      currentEcoQoSResult = configureProcessPriority(isWineOrProton);
    } catch {}
  }
}).catch((fatalErr) => {
  logStartup(`FATAL in app.whenReady(): ${fatalErr}`);
  console.error('[IRIS] Fatal startup error:', fatalErr);
  try {
    dialog.showErrorBox(
      'IRIS Initialization Notice',
      `IRIS encountered an issue during startup:\n${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}\n\nThe system tray icon remains active.`
    );
  } catch {}
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  if (autoModeTimer) {
    clearInterval(autoModeTimer);
    autoModeTimer = null;
  }
  if (serverInstance) {
    await stopServer();
    serverInstance = null;
  }
});

app.on('window-all-closed', () => {
  // Do not quit when windows close; IRIS stays alive in the tray
});
