/* ==========================================================
   Marina — Soul of the North Coast
   Navigation + QR generation (owner auto-refresh, guest QR)
   ========================================================== */

// ---------- Config (edit these for your unit) ----------
const OWNER = {
  username: 'ogtechtest',
  unit: '[1(12 المنطقة) 1/2/ ش م ج]',
  role: 'Owner'
};
const QR_REFRESH_SECONDS = 3;

// ---------- Elements ----------
const splash = document.getElementById('splash');
const app = document.getElementById('app');
const pageTitle = document.getElementById('pageTitle');
const backBtn = document.getElementById('backBtn');
const tabs = document.querySelectorAll('.tab');
const pages = document.querySelectorAll('.page');

const TITLES = {
  gate: 'Access Gate',
  explore: 'Explore',
  visits: 'Visits',
  more: 'More',
  invite: 'Invite a Guest',
  beach: 'Invite to Beach',
  guestqr: 'Guest QR Code'
};

// Pages that show the back arrow instead of tabs highlighting
const SUBPAGES = ['invite', 'beach', 'guestqr'];

let currentPage = 'gate';
let currentGuest = null;

// ---------- Splash ----------
window.addEventListener('load', () => {
  setTimeout(() => {
    splash.classList.add('fade');
    app.classList.remove('hidden');
    setTimeout(() => splash.remove(), 700);
    startOwnerQR();
    renderVisits();
  }, 1600);
});

// ---------- Navigation ----------
function show(pageId) {
  currentPage = pageId;
  pages.forEach(p => p.classList.add('hidden'));
  const target = document.getElementById('page-' + (pageId === 'beach' ? 'invite' : pageId));
  if (target) target.classList.remove('hidden');

  pageTitle.textContent = TITLES[pageId] || 'Marina';
  backBtn.classList.toggle('hidden', !SUBPAGES.includes(pageId));

  tabs.forEach(t => t.classList.toggle('active',
    t.dataset.tab === pageId && !SUBPAGES.includes(pageId)));

  // Beach invites pre-select the beach visit type
  if (pageId === 'beach') document.getElementById('guestType').value = 'Beach';
  if (pageId === 'invite') document.getElementById('guestType').value = 'Marina';
}

tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab)));
document.querySelectorAll('[data-nav]').forEach(b =>
  b.addEventListener('click', () => show(b.dataset.nav)));
backBtn.addEventListener('click', () => {
  show(currentPage === 'guestqr' ? 'gate' : 'gate');
});

// ---------- Owner QR (auto-refresh) ----------
let ownerQR = null;
let countdown = QR_REFRESH_SECONDS;
const countdownEl = document.getElementById('qrCountdown');

document.getElementById('ownerName').textContent = OWNER.username;
document.getElementById('unitNumber').textContent = OWNER.unit;

function ownerPayload() {
  // Rotating payload: username + unit + timestamp + random token,
  // so each refresh produces a new single-use code.
  return JSON.stringify({
    u: OWNER.username,
    unit: OWNER.unit,
    role: OWNER.role,
    t: Date.now(),
    n: Math.random().toString(36).slice(2, 10)
  });
}

function drawOwnerQR() {
  const box = document.getElementById('ownerQR');
  box.innerHTML = '';
  ownerQR = new QRCode(box, {
    text: ownerPayload(),
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M
  });
}

function startOwnerQR() {
  drawOwnerQR();
  setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      drawOwnerQR();
      countdown = QR_REFRESH_SECONDS;
    }
    countdownEl.textContent = countdown;
  }, 1000);
}

// ---------- Guest QR ----------
const guestNameInput = document.getElementById('guestName');
const guestDateInput = document.getElementById('guestDate');
const guestTypeInput = document.getElementById('guestType');

// Default the date field to today
guestDateInput.valueAsDate = new Date();

document.getElementById('generateGuestQR').addEventListener('click', () => {
  const name = guestNameInput.value.trim();
  const date = guestDateInput.value;
  if (!name) { guestNameInput.focus(); guestNameInput.style.borderColor = '#e8493e'; return; }
  if (!date) { guestDateInput.focus(); return; }
  guestNameInput.style.borderColor = '';

  currentGuest = {
    id: 'g' + Date.now(),
    name,
    date,
    type: guestTypeInput.value,
    host: OWNER.username,
    unit: OWNER.unit,
    status: 'Scheduled'
  };
  saveVisit(currentGuest);
  showGuestQR(currentGuest);
});

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[d.getDay()]} ${d.getDate()}, ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function showGuestQR(guest) {
  currentGuest = guest;
  document.getElementById('qrGuestName').textContent = guest.name;
  document.getElementById('qrGuestDate').textContent = formatDate(guest.date);
  const box = document.getElementById('guestQR');
  box.innerHTML = '';
  new QRCode(box, {
    text: JSON.stringify({
      id: guest.id, guest: guest.name, date: guest.date,
      type: guest.type, host: guest.host, unit: guest.unit
    }),
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M
  });
  show('guestqr');
  guestNameInput.value = '';
}

// Share QR — uses the Web Share API where available, otherwise downloads the PNG
document.getElementById('shareQR').addEventListener('click', async () => {
  const img = document.querySelector('#guestQR img') || document.querySelector('#guestQR canvas');
  if (!img) return;
  const dataUrl = img.tagName === 'IMG' ? img.src : img.toDataURL('image/png');
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], 'marina-guest-qr.png', { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Marina Guest QR',
        text: `Guest pass for ${currentGuest.name} — ${formatDate(currentGuest.date)}`
      });
      return;
    } catch (e) { /* user dismissed share sheet */ }
  }
  // Fallback: download the image
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'marina-guest-qr.png';
  a.click();
});

document.getElementById('cancelVisit').addEventListener('click', () => {
  if (currentGuest) removeVisit(currentGuest.id);
  show('gate');
});

// ---------- Visits (persisted in localStorage) ----------
function loadVisits() {
  try { return JSON.parse(localStorage.getItem('marinaVisits')) || []; }
  catch { return []; }
}
function saveVisit(v) {
  const visits = loadVisits();
  visits.unshift(v);
  localStorage.setItem('marinaVisits', JSON.stringify(visits));
  renderVisits();
}
function removeVisit(id) {
  const visits = loadVisits().filter(v => v.id !== id);
  localStorage.setItem('marinaVisits', JSON.stringify(visits));
  renderVisits();
}
function renderVisits() {
  const list = document.getElementById('visitsList');
  const empty = document.getElementById('visitsEmpty');
  const visits = loadVisits();
  list.innerHTML = '';
  empty.classList.toggle('hidden', visits.length > 0);
  visits.forEach(v => {
    const item = document.createElement('button');
    item.className = 'visit-item';
    item.innerHTML = `
      <span>
        <span class="visit-name">${escapeHtml(v.name)}</span>
        <div class="visit-date">${formatDate(v.date)} · ${v.type}</div>
      </span>
      <span class="status-pill">${v.status}</span>`;
    item.addEventListener('click', () => showGuestQR(v));
    list.appendChild(item);
  });
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
