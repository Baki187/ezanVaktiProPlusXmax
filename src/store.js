/**
 * Basit localStorage benzeri bir ayar yönetici
 * electron-store yerine native fs kullanıyoruz (bağımlılığı azaltmak için)
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Store {
  constructor() {
    const userDataPath = app.getPath('userData');
    this.path = path.join(userDataPath, 'settings.json');
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.path)) {
        const raw = fs.readFileSync(this.path, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      // bozultuysa sıfırla
    }
    return {};
  }

  _save() {
    try {
      const dir = path.dirname(this.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Store save error:', e);
    }
  }

  get(key, defaultValue) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue;
  }

  set(key, value) {
    this.data[key] = value;
    this._save();
  }

  delete(key) {
    delete this.data[key];
    this._save();
  }
}

module.exports = Store;
