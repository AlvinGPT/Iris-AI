const { contextBridge, ipcRenderer } = require('electron');

const irisNativeApi = {
  isDesktop: true,
  getPlatformInfo: () => ipcRenderer.invoke('iris:get-platform-info'),
  getFirebaseCredentials: () => ipcRenderer.invoke('iris:get-firebase-credentials'),
  getFirebaseApiKey: () => ipcRenderer.sendSync('iris:get-firebase-api-key-sync'),
  isStartupEnabled: () => ipcRenderer.invoke('iris:is-startup-enabled'),
  setStartupEnabled: (enabled) => ipcRenderer.invoke('iris:set-startup-enabled', enabled),
  saveCustomApiKey: (key) => ipcRenderer.invoke('iris:save-custom-api-key', key),
  hasConfiguredApiKey: () => ipcRenderer.invoke('iris:has-configured-api-key'),
  toggleEcoQoS: (enabled) => ipcRenderer.invoke('iris:toggle-ecoqos', enabled),
  minimizeToTray: () => ipcRenderer.invoke('iris:minimize-to-tray'),
  isStartedHidden: () => ipcRenderer.sendSync('iris:is-started-hidden-sync'),
  // Custom Window Controls
  minimizeWindow: () => ipcRenderer.invoke('iris:window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('iris:window-maximize'),
  closeWindow: () => ipcRenderer.invoke('iris:window-close'),
  // Google OAuth 2.0 Loopback Desktop Authentication (RFC 8252)
  openGoogleLogin: () => ipcRenderer.invoke('iris:open-google-login'),
  focusMainWindow: () => ipcRenderer.invoke('iris:focus-main-window'),
  onAuthDesktopSuccess: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('iris:auth-desktop-success', handler);
    return () => ipcRenderer.removeListener('iris:auth-desktop-success', handler);
  },
};

try {
  contextBridge.exposeInMainWorld('irisNative', irisNativeApi);
  contextBridge.exposeInMainWorld('electronAPI', irisNativeApi);
} catch (err) {
  console.warn('[Preload] Failed to expose irisNative contextBridge:', err);
}
