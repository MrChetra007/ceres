const EE_PROJECT_ID = 'gen-lang-client-0978198347';
const CLIENT_ID = '355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com';

const map = L.map('map', { center: [13.05, 103.175], zoom: 11 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

let ndviLayer = null;

document.getElementById('sign-in-btn').addEventListener('click', authenticate);

function authenticate() {
  setStatus('authenticating', 'Signing in...');
  ee.data.authenticateViaOauth(
    CLIENT_ID,
    () => {
      setStatus('initializing', 'Initializing Earth Engine...');
      ee.initialize(
        null, null,
        () => {
          setStatus('computing', 'Computing NDVI...');
          computeAndShowNdvi();
        },
        (err) => setStatus('error', `Init failed: ${err?.message || err}`),
        null,
        EE_PROJECT_ID
      );
    },
    (err) => setStatus('error', `Auth failed: ${err?.message || err}`)
  );
}

function computeAndShowNdvi() {
  const battambang = ee.Geometry.Rectangle([103.10, 12.95, 103.25, 13.05]);
  const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(battambang)
    .filterDate('2026-06-01', '2026-07-01')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .median();

  const ndvi = s2.normalizedDifference(['B8', 'B4']).rename('NDVI');
  const ndviVis = { min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] };

  ndvi.getMap(ndviVis, (mapId, err) => {
    if (err || !mapId?.urlFormat) {
      setStatus('error', err || 'Could not get tile URL from Earth Engine');
      return;
    }
    if (ndviLayer) map.removeLayer(ndviLayer);
    ndviLayer = L.tileLayer(mapId.urlFormat, {
      attribution: 'Sentinel-2 / Google Earth Engine',
      opacity: 0.8,
    }).addTo(map);
    setStatus('ready', 'NDVI layer loaded — June 2026');
  });
}

function setStatus(state, text) {
  const bar = document.getElementById('status-bar');
  bar.textContent = text;
  bar.className = `status-bar ${state}`;
  document.getElementById('auth-overlay').style.display =
    (state === 'ready' || state === 'computing' || state === 'initializing') ? 'none' : 'flex';
}
