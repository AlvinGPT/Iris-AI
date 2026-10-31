import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, session, shell, net, type NativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { configureChromiumSwitches, detectPlatformEnvironment } from './platformAdapter.ts';
import { configureProcessPriority, restoreProcessPriority } from './ecoQoS.ts';
import { getFirebaseApiKey, getGeminiApiKey, saveToVault, readFromVault } from './securityVault.ts';
import { startServer, stopServer, IrisServerInstance } from '../server.ts';

if (app.isPackaged || !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
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
  logStartup(`Uncaught Exception in Main Process: ${err?.stack || err}`);
});

process.on('unhandledRejection', (reason) => {
  logStartup(`Unhandled Rejection in Main Process: ${(reason as any)?.stack || reason}`);
});

// 1. Configure platform driver alternatives and background switches before app is ready
const platform = detectPlatformEnvironment();
const isWineOrProton = platform === 'wine' || platform === 'proton';
try {
  configureChromiumSwitches(app);
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
let tray: Tray | null = null;
let serverInstance: IrisServerInstance | null = null;
let isQuitting = false;
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

const isStartedHidden =
  process.argv.includes('--hidden') || Boolean((app.getLoginItemSettings() as any).wasOpenedAsHidden);

app.on('second-instance', () => {
  logStartup('Second instance launch signal received. Showing main window.');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

function resolveTrayIcon(): NativeImage {
  const iconCandidates = [
    path.join(appDir, '../public/assets/icon.ico'),
    path.join(process.cwd(), 'public/assets/icon.ico'),
    path.join(appDir, 'public/assets/icon.ico'),
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
  return nativeImage.createEmpty();
}

function updateTrayContextMenu() {
  if (!tray) return;

  const isBootEnabled = app.getLoginItemSettings().openAtLogin;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open IRIS AI Studio',
      click: () => {
        if (mainWindow) {
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
        if (mainWindow) {
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
  const icon = resolveTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('IRIS AI Studio - Low-Impact Vision Daemon');

  updateTrayContextMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
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

async function createWindow(distPath: string, serverPort: number, isServerReady: boolean) {
  // Completely disable top application menu bar (File, Edit, View, Window)
  Menu.setApplicationMenu(null);

  const preloadCandidates = [
    path.join(appDir, 'preload.cjs'),
    path.join(appDir, 'electron/preload.cjs'),
    path.join(process.cwd(), 'dist-electron/preload.cjs'),
    path.join(process.cwd(), 'electron/preload.cjs'),
  ];
  let preloadPath = path.join(appDir, 'preload.cjs');
  for (const p of preloadCandidates) {
    if (fs.existsSync(p)) {
      preloadPath = p;
      break;
    }
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#0c0f14',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // CRITICAL: Never throttle MediaPipe vision when window is hidden
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

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

  if (isServerReady) {
    const targetUrl = `http://localhost:${serverPort}`;
    logStartup(`Loading application directly from live daemon: ${targetUrl}`);
    try {
      await mainWindow.loadURL(targetUrl);
    } catch (err) {
      logStartup(`mainWindow.loadURL failed: ${err}, falling back to static file.`);
      const staticIndexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(staticIndexHtml)) {
        await mainWindow.loadFile(staticIndexHtml);
      }
    }
  } else {
    logStartup('Express daemon not ready, falling back to local static file.');
    const staticIndexHtml = path.join(distPath, 'index.html');
    if (fs.existsSync(staticIndexHtml)) {
      await mainWindow.loadFile(staticIndexHtml);
    }
  }

  if (!isStartedHidden) {
    mainWindow.show();
    mainWindow.focus();
    logStartup('mainWindow shown and focused.');
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
    }
    return true;
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

  // 1. Initialize internal Express + WebSocket daemon FIRST so http://localhost:${serverPort} is immediately ready
  let serverPort = 3000;
  let isServerReady = false;
  try {
    logStartup(`Initializing Express daemon (dist: ${distPath}, db: ${dbPath})...`);
    serverInstance = await startServer({
      port: 3000,
      dbPath,
      distPath,
    });
    serverPort = serverInstance.port;
    logStartup(`Express server daemon active on port ${serverPort}`);
    isServerReady = await waitForServer(serverPort, 50, 80);
    logStartup(`Server readiness check on port ${serverPort}: ${isServerReady ? 'READY' : 'TIMEOUT'}`);
  } catch (err) {
    logStartup(`Express daemon startup failed: ${err} (Application operating in offline local mode)`);
  }

  // 2. Create window and load http://localhost:${serverPort} directly
  await createWindow(distPath, serverPort, isServerReady);

  if (isStartedHidden) {
    try {
      currentEcoQoSResult = configureProcessPriority(isWineOrProton);
    } catch {}
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', async () => {
  isQuitting = true;
  if (serverInstance) {
    await stopServer();
    serverInstance = null;
  }
});

app.on('window-all-closed', () => {
  // Do not quit when windows close; IRIS stays alive in the tray
});
