const EE_PROJECT_ID = 'gen-lang-client-0978198347';
const CLIENT_ID = '355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com';
const AOI_COORDS = [103.10, 12.95, 103.25, 13.05];
const NDVI_VIS = { min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] };

const MONTHS = [
  { year: 2025, month: 6,  label: 'Jun 2025' },
  { year: 2025, month: 7,  label: 'Jul 2025' },
  { year: 2025, month: 8,  label: 'Aug 2025' },
  { year: 2025, month: 9,  label: 'Sep 2025' },
  { year: 2025, month: 10, label: 'Oct 2025' },
  { year: 2025, month: 11, label: 'Nov 2025' },
  { year: 2025, month: 12, label: 'Dec 2025' },
  { year: 2026, month: 1,  label: 'Jan 2026' },
  { year: 2026, month: 2,  label: 'Feb 2026' },
  { year: 2026, month: 3,  label: 'Mar 2026' },
  { year: 2026, month: 4,  label: 'Apr 2026' },
  { year: 2026, month: 5,  label: 'May 2026' },
  { year: 2026, month: 6,  label: 'Jun 2026' },
  { year: 2026, month: 7,  label: 'Jul 2026' },
];

const map = L.map('map', { center: [13.05, 103.175], zoom: 11 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

let ndviLayer = null;
let debounceTimer = null;

document.getElementById('sign-in-btn').addEventListener('click', authenticate);

document.getElementById('month-slider').addEventListener('input', function () {
  clearTimeout(debounceTimer);
  document.getElementById('slider-panel').classList.add('loading');
  debounceTimer = setTimeout(() => {
    loadNdviForMonth(parseInt(this.value));
  }, 300);
});

const savedCreds = localStorage.getItem('ee_auth_creds');
if (savedCreds) {
  try {
    const creds = JSON.parse(savedCreds);
    ee.data.setAuthToken(CLIENT_ID, creds.access_token, creds.expires_in);
    initializeEE();
  } catch (e) {
    localStorage.removeItem('ee_auth_creds');
  }
}

function authenticate() {
  setStatus('authenticating', 'Signing in...');
  ee.data.authenticateViaOauth(
    CLIENT_ID,
    () => {
      const token = ee.data.getAuthToken();
      if (token) {
        localStorage.setItem('ee_auth_creds', JSON.stringify({
          access_token: token,
          expires_in: 3600,
        }));
      }
      initializeEE();
    },
    (err) => setStatus('error', `Auth failed: ${err?.message || err}`)
  );
}

function initializeEE() {
  setStatus('initializing', 'Initializing Earth Engine...');
  ee.initialize(
    null, null,
    () => {
      document.getElementById('slider-panel').style.display = 'block';
      document.getElementById('auth-overlay').style.display = 'none';
      setStatus('computing', 'Computing NDVI...');
      loadNdviForMonth(parseInt(document.getElementById('month-slider').value));
    },
    (err) => {
      localStorage.removeItem('ee_auth_creds');
      setStatus('error', `Init failed: ${err?.message || err}`);
    },
    null,
    EE_PROJECT_ID
  );
}

function getNdviForMonth(year, month) {
  const start = ee.Date.fromYMD(year, month, 1);
  const end = start.advance(1, 'month');
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(ee.Geometry.Rectangle(AOI_COORDS))
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .median()
    .normalizedDifference(['B8', 'B4'])
    .rename('NDVI');
}

function loadNdviForMonth(idx) {
  const m = MONTHS[idx];
  if (!m) return;
  document.getElementById('month-label').textContent = m.label;
  setStatus('computing', `Computing NDVI — ${m.label}...`);

  const ndvi = getNdviForMonth(m.year, m.month);
  ndvi.getMap(NDVI_VIS, (mapId, err) => {
    document.getElementById('slider-panel').classList.remove('loading');
    if (err || !mapId?.urlFormat) {
      setStatus('error', `No data for ${m.label} — try a different month`);
      return;
    }
    if (ndviLayer) map.removeLayer(ndviLayer);
    ndviLayer = L.tileLayer(mapId.urlFormat, {
      attribution: 'Sentinel-2 / Google Earth Engine',
      opacity: 0.8,
    }).addTo(map);
    setStatus('ready', `NDVI layer loaded — ${m.label}`);
  });
}

function setStatus(state, text) {
  const bar = document.getElementById('status-bar');
  bar.textContent = text;
  bar.className = `status-bar ${state}`;
}
