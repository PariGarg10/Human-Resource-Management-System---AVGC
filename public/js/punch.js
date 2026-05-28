window.HRMS = window.HRMS || {};

HRMS.haversineMeters = function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

HRMS.getOfficeLocation = function getOfficeLocation() {
  try {
    const raw = localStorage.getItem('office_location');
    if (raw) {
      const o = JSON.parse(raw);
      const lat = Number(o.lat);
      const lng = Number(o.lng);
      const radiusMeters = Number(o.radiusMeters) || 200;
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng, radiusMeters };
    }
  } catch (_e) {}
  /* Default: AVGC Studios, 3rd Floor, Plot no. 8, Pinnacle Tower, Sector 142, Noida (near Sector 142 metro) */
  return { lat: 28.4995, lng: 77.4128, radiusMeters: 250 };
};

/**
 * @param {{ api: Function, ids: { clock: string, date: string, pill: string, btn: string, msg: string } }} opts
 */
HRMS.initPunchScreen = function initPunchScreen(opts) {
  const api = opts.api;
  const ids = opts.ids;
  const el = (id) => document.getElementById(id);
  const clockEl = el(ids.clock);
  const dateEl = el(ids.date);
  const pillEl = el(ids.pill);
  const btnEl = el(ids.btn);
  const msgEl = el(ids.msg);
  if (!clockEl || !dateEl || !pillEl || !btnEl || !msgEl) return;

  let punchedIn = false;
  let dayComplete = false;
  let todayRec = null;
  let locState = 'checking';
  let watchId = null;

  function formatPunchTime(value) {
    if (!value) return '—';
    if (window.HRMS && typeof window.HRMS.formatDateTime === 'function') {
      return window.HRMS.formatDateTime(value);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleTimeString();
  }

  function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function setLocMsg() {
    if (locState === 'checking') {
      msgEl.textContent = '📍 Verifying location...';
      msgEl.style.color = 'var(--text-muted)';
    } else if (locState === 'in') {
      msgEl.textContent = '✓ At office — punch enabled';
      msgEl.style.color = 'var(--status-present)';
    } else {
      msgEl.textContent = '✗ Not at office — punch disabled';
      msgEl.style.color = 'var(--red)';
    }
  }

  function setPunchUi() {
    if (dayComplete) {
      pillEl.textContent = 'DAY COMPLETE';
      pillEl.className = 'punch-status-pill in';
      btnEl.style.display = 'none';
      btnEl.disabled = true;
      msgEl.textContent =
        'Punch in: ' +
        formatPunchTime(todayRec && todayRec.punchin) +
        ' · Punch out: ' +
        formatPunchTime(todayRec && todayRec.punchout);
      msgEl.style.color = 'var(--text-muted)';
      return;
    }
    btnEl.style.display = '';
    pillEl.textContent = punchedIn ? 'PUNCHED IN' : 'PUNCHED OUT';
    pillEl.className = 'punch-status-pill ' + (punchedIn ? 'in' : 'out');
    btnEl.textContent = punchedIn ? 'PUNCH OUT' : 'PUNCH IN';
    btnEl.className = 'punch-big-btn ' + (punchedIn ? 'state-in' : 'state-out');
    btnEl.disabled = locState !== 'in';
    setLocMsg();
  }

  async function refreshToday() {
    try {
      const data = await api('/api/attendance/today');
      const rec = data.record;
      todayRec = rec || null;
      dayComplete = Boolean(rec && rec.punchin && rec.punchout);
      punchedIn = Boolean(rec && rec.punchin && !rec.punchout);
      setPunchUi();
    } catch (_e) {
      punchedIn = false;
      dayComplete = false;
      todayRec = null;
      setPunchUi();
    }
  }

  function applyGeo(lat, lng) {
    const office = HRMS.getOfficeLocation();
    const d = HRMS.haversineMeters(lat, lng, office.lat, office.lng);
    locState = d <= office.radiusMeters ? 'in' : 'out';
    setPunchUi();
  }

  tickClock();
  setInterval(tickClock, 1000);

  msgEl.textContent = '📍 Verifying location...';
  msgEl.style.color = 'var(--text-muted)';
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => applyGeo(pos.coords.latitude, pos.coords.longitude),
      () => {
        locState = 'out';
        setPunchUi();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  } else {
    locState = 'out';
    setPunchUi();
  }

  btnEl.addEventListener('click', async () => {
    if (btnEl.disabled) return;
    try {
      const type = punchedIn ? 'out' : 'in';
      const res = await api('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (HRMS.toast) HRMS.toast(res.message || 'Saved', 'success');
      await refreshToday();
    } catch (e) {
      if (HRMS.toast) HRMS.toast(e.message || 'Punch failed', 'error');
    }
  });

  refreshToday().catch(() => {});

  return function dispose() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  };
};

HRMS.renderLeadershipSection = function renderLeadershipSection(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const quoteRaw =
    localStorage.getItem('founder_quote') ||
    'Great teams are not built on policies, but on trust, vision, and the courage to grow together.';
  const quote = String(quoteRaw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
  const photo = localStorage.getItem('founder_photo');
  const photoBlock = photo
    ? `<img class="leadership-photo" src="${String(photo).replace(/"/g, '&quot;')}" alt="" />`
    : `<div class="leadership-photo initials" aria-hidden="true">AM</div>`;
  root.innerHTML = `
    <div class="leadership-section">
      <span class="leadership-quote-mark" aria-hidden="true">"</span>
      <div class="leadership-inner">
        ${photoBlock}
        <p class="leadership-quote-text">${quote}</p>
        <div class="leadership-name">Ashish Mishra</div>
        <div class="leadership-title">Founder</div>
      </div>
    </div>
  `;
};
