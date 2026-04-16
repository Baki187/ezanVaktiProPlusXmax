/* ============================================================
   Ezan Vakti Pro — Renderer Logic
   Aladhan API ile vakit çekimi, geri sayım, bildirim sistemi
   ============================================================ */

const PRAYER_META = {
  Imsak:   { name: 'İmsak',  icon: '🌅' },
  Fajr:    { name: 'İmsak',  icon: '🌅' },
  Sunrise: { name: 'Güneş',  icon: '☀️' },
  Dhuhr:   { name: 'Öğle',   icon: '🌤️' },
  Asr:     { name: 'İkindi', icon: '🌇' },
  Maghrib: { name: 'Akşam',  icon: '🌆' },
  Isha:    { name: 'Yatsı',  icon: '🌙' },
};

// API'den gelecek sıralı key listesi (Imsak dahil)
const PRAYER_ORDER = ['Imsak', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

let settings = {
  city: 'Ankara',
  country: 'Turkey',
  notifications: true,
  method: 13,
};

let timings = {};           // { Imsak: "04:12", Fajr: "04:27", ... }
let countdownInterval = null;
let loadedDate = '';        // 'YYYY-MM-DD' son yükleme tarihi
let notifiedPrayers = {};   // { key: true } bildirim gönderildi mi
let lastActiveIdx = -99;    // Aktif vakit takibi — sadece değişince liste render edilir

// ===================== INIT =====================
window.addEventListener('DOMContentLoaded', async () => {
  settings = await window.electronAPI.getSettings();
  updateCityLabel();
  loadPrayerTimes();
  startCountdown();

  const ver = await window.electronAPI.getVersion();
  document.getElementById('versionInfo').textContent = `v${ver}`;

  // Gece yarısı geçilirse yeniden yükle
  scheduleNextDayReload();
});

// ===================== API =====================
async function loadPrayerTimes() {
  setStatus('Vakitler yükleniyor...');
  const today = getTodayStr();

  try {
    const url = `https://api.aladhan.com/v1/timingsByCity/${today}?city=${encodeURIComponent(settings.city)}&country=${encodeURIComponent(settings.country)}&method=${settings.method}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.code !== 200) throw new Error(json.status || 'API hatası');

    timings = json.data.timings;
    loadedDate = today;
    notifiedPrayers = {};

    renderPrayerList();
    updateHijriDate(json.data.date);
    setStatus(`Son güncelleme: ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    console.error('API Error:', err);
    setStatus('⚠️ Bağlantı hatası — tekrar deneniyor...');
    // 30 sn sonra tekrar dene
    setTimeout(loadPrayerTimes, 30000);
  }
}

// ===================== RENDER =====================
// Tüm listeyi sıfırdan oluştur — sadece vakitler yüklendiğinde veya aktif vakit değişince çağrılır
function renderPrayerList() {
  const now = getNowMinutes();
  const prayerTimes = getPrayerTimesArray();
  const nextIdx = prayerTimes.findIndex(p => p.minutes > now);
  const activeIdx = nextIdx === -1 ? prayerTimes.length - 1 : (nextIdx - 1 + prayerTimes.length) % prayerTimes.length;

  lastActiveIdx = activeIdx;

  const container = document.getElementById('prayersList');
  container.innerHTML = '';

  prayerTimes.forEach((prayer, idx) => {
    const isPassed = nextIdx !== -1 ? idx < nextIdx : idx < prayerTimes.length;
    const isCurrent = idx === activeIdx;
    const isNext = idx === nextIdx;

    const item = document.createElement('div');
    item.className = `prayer-item${isCurrent ? ' active' : ''}${isPassed && !isCurrent ? ' passed' : ''}`;
    item.setAttribute('data-key', prayer.key);
    // Animasyon: sadece ilk yüklemede uygula, sonraki render'larda devre dışı
    item.style.animationDelay = `${idx * 0.05}s`;

    item.innerHTML = `
      <div class="prayer-icon">${PRAYER_META[prayer.key]?.icon || '🕌'}</div>
      <div class="prayer-details">
        <span class="prayer-name">${PRAYER_META[prayer.key]?.name || prayer.key}</span>
      </div>
      ${isCurrent ? '<span class="active-badge">Şimdiki</span>' : ''}
      ${isNext ? '<span class="active-badge" style="background:rgba(196,153,82,0.2);color:var(--gold-light)">Sonraki</span>' : ''}
      <div class="prayer-time">${prayer.time}</div>
    `;

    container.appendChild(item);
  });
}

// Aktif vakit değişti mi diye kontrol eder — değiştiyse listeyi yeniden render eder
// Her saniye çağrılır ama DOM'a sadece vakit geçişinde dokunur
function checkAndUpdateActiveClass() {
  const now = getNowMinutes();
  const prayerTimes = getPrayerTimesArray();
  if (prayerTimes.length === 0) return;

  const nextIdx = prayerTimes.findIndex(p => p.minutes > now);
  const activeIdx = nextIdx === -1
    ? prayerTimes.length - 1
    : (nextIdx - 1 + prayerTimes.length) % prayerTimes.length;

  // Aktif vakit değişmediyse DOM'a dokunma
  if (activeIdx === lastActiveIdx) return;

  // Aktif vakit değişti → listeyi yeniden render et
  renderPrayerList();
}

function updateHijriDate(dateObj) {
  if (!dateObj) return;
  const hijri = dateObj.hijri;
  document.getElementById('dateHicri').textContent =
    `${hijri.day} ${hijri.month.ar} ${hijri.year} هـ`;
}

function updateMiladiDate() {
  const now = new Date();
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('dateMiladi').textContent = now.toLocaleDateString('tr-TR', opts);
}

// ===================== COUNTDOWN =====================
function startCountdown() {
  updateMiladiDate();
  updateCountdown();
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    updateCountdown();
    checkPrayerNotifications();
    // Günlük yenileme
    const today = getTodayStr();
    if (loadedDate && loadedDate !== today) loadPrayerTimes();
  }, 1000);
}

function updateCountdown() {
  if (Object.keys(timings).length === 0) return;

  const now = getNowMinutes();
  const prayerTimes = getPrayerTimesArray();
  let nextIdx = prayerTimes.findIndex(p => p.minutes > now);

  let nextPrayer, prevPrayer;

  if (nextIdx === -1) {
    // Gece - ertesi günün ilk vakti (İmsak)
    nextPrayer = { ...prayerTimes[0], name: 'Yarın İmsak' };
    prevPrayer = prayerTimes[prayerTimes.length - 1];
  } else {
    nextPrayer = prayerTimes[nextIdx];
    prevPrayer = prayerTimes[(nextIdx - 1 + prayerTimes.length) % prayerTimes.length];
  }

  // Kalan saniye hesapla
  const nowSec = getNowSeconds();
  let targetSec;

  if (nextIdx === -1) {
    // Gece yarısından sonra imsak — ertesi gün
    const imsakMin = prayerTimes[0].minutes;
    const todayTotalMin = 24 * 60;
    targetSec = (todayTotalMin - Math.floor(nowSec / 60) + imsakMin) * 60 - (nowSec % 60);
  } else {
    targetSec = (nextPrayer.minutes - Math.floor(nowSec / 60)) * 60 - (nowSec % 60);
  }

  if (targetSec < 0) targetSec = 0;

  const h = Math.floor(targetSec / 3600);
  const m = Math.floor((targetSec % 3600) / 60);
  const s = targetSec % 60;
  const timerStr = `${pad(h)}:${pad(m)}:${pad(s)}`;

  document.getElementById('nextPrayerName').textContent = PRAYER_META[nextPrayer.key]?.name || nextPrayer.name || nextPrayer.key;
  document.getElementById('countdownTimer').textContent = timerStr;
  document.getElementById('nextPrayerTime').textContent = `Vakit saati: ${nextPrayer.time}`;

  // Progress bar — önceki vakitten sonraki vakite kadar olan yüzde
  const prevMin = prevPrayer.minutes;
  const nextMin = nextIdx === -1 ? prayerTimes[0].minutes + 24 * 60 : nextPrayer.minutes;
  const nowMin = getNowMinutes();
  const range = nextMin - (nextIdx === -1 ? prevMin - 24 * 60 : prevMin);
  const elapsed = nowMin - (nextIdx === -1 ? prevMin - 24 * 60 : prevMin);
  const pct = Math.min(100, Math.max(0, (elapsed / range) * 100));
  document.getElementById('countdownProgress').style.width = `${pct}%`;

  // Aktif vakit değişip değişmediğini kontrol et — değiştiyse liste yeniden render edilir
  // Bu fonksiyon DOM'a sadece gerektiğinde dokunur, her saniye flicker yaratmaz
  checkAndUpdateActiveClass();
}

// ===================== NOTIFICATIONS =====================
function checkPrayerNotifications() {
  if (!settings.notifications) return;
  const prayerTimes = getPrayerTimesArray();
  const now = getNowSeconds();
  const nowMin = Math.floor(now / 60);
  const nowSec = now % 60;

  prayerTimes.forEach(prayer => {
    // Tam dakika + ilk 5 saniye içinde bildir
    if (prayer.minutes === nowMin && nowSec < 5 && !notifiedPrayers[prayer.key]) {
      notifiedPrayers[prayer.key] = true;
      const prayerName = PRAYER_META[prayer.key]?.name || prayer.key;
      window.electronAPI.sendNotification(
        `🕌 ${prayerName} Vakti`,
        `${settings.city} için ${prayerName} vakti girdi. ${prayer.time}`
      );
    }
  });
}

// ===================== SETTINGS =====================
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('backBtn').addEventListener('click', closeSettings);
document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.hideWindow());

function openSettings() {
  document.getElementById('cityInput').value = settings.city;
  document.getElementById('countryInput').value = settings.country;
  document.getElementById('methodSelect').value = String(settings.method);
  document.getElementById('notifToggle').checked = settings.notifications;

  const panel = document.getElementById('settingsPanel');
  panel.classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settingsPanel').classList.add('hidden');
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  settings.city = document.getElementById('cityInput').value.trim() || 'Ankara';
  settings.country = document.getElementById('countryInput').value.trim() || 'Turkey';
  settings.method = parseInt(document.getElementById('methodSelect').value, 10);
  settings.notifications = document.getElementById('notifToggle').checked;

  await window.electronAPI.saveSettings(settings);
  updateCityLabel();
  closeSettings();
  loadPrayerTimes();

  const btn = document.getElementById('saveBtn');
  btn.textContent = '✓ Kaydedildi';
  btn.classList.add('save-success');
  setTimeout(() => {
    btn.textContent = '💾 Kaydet';
    btn.classList.remove('save-success');
  }, 2000);
});

// ===================== UTILS =====================
function getPrayerTimesArray() {
  return PRAYER_ORDER
    .filter(key => timings[key])
    .map(key => ({
      key,
      time: timings[key],
      minutes: timeToMinutes(timings[key]),
    }));
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getNowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getNowSeconds() {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

function getTodayStr() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}-${m}-${y}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function setStatus(msg) {
  document.getElementById('statusText').textContent = msg;
}

function updateCityLabel() {
  document.getElementById('cityName').textContent = `${settings.city}, ${settings.country}`;
}

function scheduleNextDayReload() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 1, 0, 0); // gece yarısı +1 dk
  const msUntilMidnight = nextMidnight - now;
  setTimeout(() => {
    loadPrayerTimes();
    scheduleNextDayReload();
  }, msUntilMidnight);
}
