const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, screen } = require('electron');
const path = require('path');
const Store = require('./store');

// Sadece tek instance çalışsın
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let tray = null;
let mainWindow = null;
const store = new Store();

// Masaüstü kısayolu oluşturulmasın
app.setPath('userData', path.join(app.getPath('appData'), 'EzanVaktiPro'));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,          // Görev çubuğunda görünmesin
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Odak kaybolunca kapat
  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getWindowPosition() {
  const windowBounds = mainWindow.getBounds();
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y
  });
  const workArea = display.workArea;

  // Sağ alttan konumlandır
  const x = Math.round(workArea.x + workArea.width - windowBounds.width - 12);
  const y = Math.round(workArea.y + workArea.height - windowBounds.height - 12);

  return { x, y };
}

function toggleWindow() {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function showWindow() {
  const position = getWindowPosition();
  mainWindow.setPosition(position.x, position.y, false);
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  
  tray = new Tray(icon);
  tray.setToolTip('Ezan Vakti Pro+ Xmax');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ezan Vakti Pro+ Xmax',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Göster / Gizle',
      click: () => toggleWindow(),
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.on('click', () => toggleWindow());
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return store.get('settings', {
    city: 'Ankara',
    country: 'Turkey',
    notifications: true,
    method: 13, // Diyanet İşleri
  });
});

ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});

ipcMain.on('hide-window', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('show-notification', (event, { title, body }) => {
  const settings = store.get('settings', { notifications: true });
  if (!settings.notifications) return;

  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      silent: false,
    });
    notification.show();
  }
});

ipcMain.handle('get-version', () => app.getVersion());

// Windows'ta başlangıçta otomatik çalış
function setAutoLaunch() {
  if (process.platform === 'win32') {
    const launchArgs = [];
    if (!app.isPackaged) {
      launchArgs.push(app.getAppPath());
    }
    launchArgs.push('--hidden');

    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: process.execPath,
      args: launchArgs,
    });
  }
}

app.whenReady().then(() => {
  // Masaüstü kısayolu oluşturmayı engelle
  app.setAppUserModelId('com.ezanvakti.pro.xmax');
  
  createWindow();
  createTray();
  setAutoLaunch();

  // --hidden argümanı yoksa pencereyi göster (sadece Windows auto-launch'ta --hidden gelir)
  const args = process.argv;
  if (!args.includes('--hidden')) {
    showWindow();
  }
});

app.on('window-all-closed', (e) => {
  // Pencere kapatılsa bile uygulama çalışmaya devam etsin (tray'de kalsın)
  e.preventDefault();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

// İkinci instance açılmaya çalışılırsa mevcut pencereyi göster
app.on('second-instance', () => {
  if (mainWindow) showWindow();
});
