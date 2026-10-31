const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('irisAuthBridge', {
    sendResult: (data) => ipcRenderer.send('iris:auth-bridge-result', data),
  });
} catch (err) {
  console.warn('[auth-preload] Failed to expose irisAuthBridge:', err);
}
