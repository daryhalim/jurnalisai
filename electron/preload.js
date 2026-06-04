// ============================================================
// Jurnalis.AI — Preload Script
// Runs in renderer context with access to Node.js APIs
// before the web page loads.
// ============================================================

const { contextBridge } = require('electron');

// Expose a minimal API to the renderer
contextBridge.exposeInMainWorld('jurnalisDesktop', {
  // Let the web app know it's running inside Electron
  isDesktopApp: true,
  platform: process.platform,
  version: '1.0.0',
});
