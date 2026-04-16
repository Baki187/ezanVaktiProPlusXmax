const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Ayarlar
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Pencere kontrol
  hideWindow: () => ipcRenderer.send('hide-window'),

  // Bildirim gönder
  sendNotification: (title, body) =>
    ipcRenderer.send('show-notification', { title, body }),

  // Versiyon
  getVersion: () => ipcRenderer.invoke('get-version'),
});
