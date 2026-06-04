// ============================================================
// Jurnalis.AI — Desktop Electron App
// Main Process: Anti-screenshot DRM + BrowserWindow
// ============================================================

const { app, BrowserWindow, Menu, globalShortcut, dialog, shell } = require('electron');
const path = require('path');

// Production URL of the deployed Next.js app
const APP_URL = 'https://jurnalisai.netlify.app';

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Jurnalis.AI',
    backgroundColor: '#06202B',
    
    // ========================================
    // 🔒 CORE DRM: Content Protection
    // This is the magic — makes the window
    // COMPLETELY invisible to OS screenshots,
    // screen recording, and screen sharing.
    // ========================================
    contentProtection: true,
    
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Security: disable remote module
      enableRemoteModule: false,
      // Prevent opening DevTools in production
      devTools: !app.isPackaged ? true : false,
    },

    // Window styling
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    show: false, // Don't show until ready
  });

  // ========================================
  // 🔒 EXTRA: Set content protection again
  // (Belt and suspenders approach)
  // ========================================
  mainWindow.setContentProtection(true);

  // Load the deployed Netlify app
  mainWindow.loadURL(APP_URL);

  // Show window when content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle external links — open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Handle navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow navigation within the app
    if (url.startsWith(APP_URL)) return;
    // Block navigation to external sites, open in browser instead
    event.preventDefault();
    shell.openExternal(url);
  });

  // Handle download events (for .docx export)
  mainWindow.webContents.session.on('will-download', (event, item) => {
    // Let the default download behavior work for .docx files
    const fileName = item.getFilename();
    
    item.on('done', (event, state) => {
      if (state === 'completed') {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Download Selesai',
          message: `File "${fileName}" berhasil diunduh!`,
          detail: `Tersimpan di folder Downloads Anda.`,
          buttons: ['OK']
        });
      }
    });
  });

  // Window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ========================================
// Custom Menu (removes Edit > Copy, etc.)
// ========================================
function createMenu() {
  const template = [
    {
      label: 'Jurnalis.AI',
      submenu: [
        { label: 'Tentang Jurnalis.AI', role: 'about' },
        { type: 'separator' },
        { label: 'Sembunyikan', role: 'hide' },
        { label: 'Sembunyikan Lainnya', role: 'hideOthers' },
        { label: 'Tampilkan Semua', role: 'unhide' },
        { type: 'separator' },
        { label: 'Keluar', role: 'quit' }
      ]
    },
    {
      label: 'Jendela',
      submenu: [
        { label: 'Perkecil', role: 'minimize' },
        { label: 'Zoom', role: 'zoom' },
        { type: 'separator' },
        { label: 'Layar Penuh', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Tutup', role: 'close' }
      ]
    }
  ];

  // Add DevTools in development mode
  if (!app.isPackaged) {
    template.push({
      label: 'Dev',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Force Reload', role: 'forceReload' },
        { label: 'DevTools', role: 'toggleDevTools' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ========================================
// App Lifecycle
// ========================================
app.whenReady().then(() => {
  createMenu();
  createWindow();

  // ========================================
  // 🔒 Block screenshot keyboard shortcuts
  // at the OS level (globalShortcut)
  // ========================================
  const screenshotShortcuts = [
    'CommandOrControl+Shift+3',
    'CommandOrControl+Shift+4', 
    'CommandOrControl+Shift+5',
    'CommandOrControl+Shift+S',
    'PrintScreen',
    'Alt+PrintScreen',
  ];

  screenshotShortcuts.forEach((shortcut) => {
    try {
      globalShortcut.register(shortcut, () => {
        // Silently block — do nothing
        console.log(`Blocked screenshot shortcut: ${shortcut}`);
      });
    } catch (e) {
      // Some shortcuts may not be registerable on all platforms
      console.log(`Could not register shortcut: ${shortcut}`);
    }
  });

  // macOS: re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up global shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ========================================
// Security: Prevent new window creation
// ========================================
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
