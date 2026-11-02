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
  // Floating Widget & Responsive Screen-Edge Lighting API
  sendLiveTelemetry: (data) => ipcRenderer.send('iris:live-telemetry', data),
  sendBlinkDetected: (data) => ipcRenderer.send('iris:live-blink-detected', data),
  changeWidgetMode: (mode) => ipcRenderer.invoke('iris:widget-mode-change', mode),
  validateAndSetMode: (mode) => ipcRenderer.invoke('iris:validate-and-set-mode', mode),
  getModeState: () => ipcRenderer.invoke('iris:get-mode-state'),
  resetAutoMode: () => ipcRenderer.invoke('iris:reset-auto-mode'),
  notifyBlinkChallengeCompleted: () => ipcRenderer.send('iris:blink-challenge-completed'),
  onBlinkChallengeCompleted: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('iris:blink-challenge-completed', handler);
    return () => ipcRenderer.removeListener('iris:blink-challenge-completed', handler);
  },
  getWidgetState: () => ipcRenderer.invoke('iris:widget-get-state'),
  resizeWidget: (width, height) => ipcRenderer.invoke('iris:widget-resize', { width, height }),
  saveWidgetPosition: (x, y) => ipcRenderer.send('iris:widget-save-position', { x, y }),
  moveWidgetWindow: (deltaX, deltaY) => ipcRenderer.send('iris:move-widget-window', { deltaX, deltaY }),
  setWidgetIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('iris:widget-ignore-mouse-events', { ignore, options }),
  onWidgetStateUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('iris:widget-state-update', handler);
    return () => ipcRenderer.removeListener('iris:widget-state-update', handler);
  },
  onLiveBlinkDetected: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('iris:live-blink-detected', handler);
    return () => ipcRenderer.removeListener('iris:live-blink-detected', handler);
  },
  onEdgeOverlayUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('iris:edge-overlay-update', handler);
    return () => ipcRenderer.removeListener('iris:edge-overlay-update', handler);
  },
  getConcurrentCameraStatus: () => ipcRenderer.invoke('iris:get-concurrent-camera-status'),
  onConcurrentCameraApp: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('iris:concurrent-camera-app-detected', handler);
    return () => ipcRenderer.removeListener('iris:concurrent-camera-app-detected', handler);
  },
  onConcurrentCameraAppCleared: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('iris:concurrent-camera-app-cleared', handler);
    return () => ipcRenderer.removeListener('iris:concurrent-camera-app-cleared', handler);
  },
  onMeetingCameraYield: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('iris:meeting-camera-yield', handler);
    return () => ipcRenderer.removeListener('iris:meeting-camera-yield', handler);
  },
  onResumeCameraMonitoring: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('iris:resume-camera-monitoring', handler);
    return () => ipcRenderer.removeListener('iris:resume-camera-monitoring', handler);
  },
  setMegaMaximizeAlert: (data) => ipcRenderer.send('iris:mega-maximize-alert', data),
  onMegaMaximizeUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('iris:mega-maximize-update', handler);
    return () => ipcRenderer.removeListener('iris:mega-maximize-update', handler);
  },
  notifyMegaMaximizeCompleted: () => ipcRenderer.send('iris:blink-challenge-completed'),
  setWidgetDesign: (designStyle) => ipcRenderer.invoke('iris:widget-set-design', designStyle),
  onWidgetDesignUpdate: (callback) => {
    const handler = (_event, designStyle) => callback(designStyle);
    ipcRenderer.on('iris:widget-design-update', handler);
    return () => ipcRenderer.removeListener('iris:widget-design-update', handler);
  },
  showWidgetContextMenu: (coords) => ipcRenderer.send('iris:show-widget-context-menu', coords),
};

try {
  contextBridge.exposeInMainWorld('irisNative', irisNativeApi);
  contextBridge.exposeInMainWorld('electronAPI', irisNativeApi);

  // When loaded via file:// protocol, ensure relative /api calls route to the local Express daemon
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    const rawFetch = window.fetch;
    window.fetch = function (resource, options) {
      if (typeof resource === 'string' && resource.startsWith('/api/')) {
        resource = 'http://localhost:3000' + resource;
      }
      return rawFetch.call(this, resource, options);
    };
  }
} catch (err) {
  console.warn('[Preload] Failed to expose irisNative contextBridge:', err);
}
