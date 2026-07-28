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
let trendChart = null;
let clickMarker = null;

document.getElementById('sign-in-btn').addEventListener('click', authenticate);

document.getElementById('month-slider').addEventListener('input', function () {
  clearTimeout(debounceTimer);
  document.getElementById('slider-panel').classList.add('loading');
  debounceTimer = setTimeout(() => {
    loadNdviForMonth(parseInt(this.value));
  }, 300);
});

document.getElementById('close-panel').addEventListener('click', function () {
  document.getElementById('info-panel').style.display = 'none';
});

map.on('click', function (e) {
  const { lat, lng } = e.latlng;
  document.getElementById('point-coords').textContent =
    `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
  document.getElementById('info-panel').style.display = 'flex';
  setStatus('computing', 'Fetching NDVI trend...');
  getNdviTimeSeriesAtPoint(lat, lng, function (data) {
    if (data.length === 0) {
      setStatus('error', 'No NDVI data for this point');
      return;
    }
    renderChart(data);
    checkStress(data);
    setStatus('ready', `NDVI trend loaded — ${data.length} observations`);
  });
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

function getNdviTimeSeriesAtPoint(lat, lng, callback) {
  const point = ee.Geometry.Point([lng, lat]);
  const startDate = ee.Date('2025-06-01');
  const endDate = ee.Date('2026-07-01');

  const allImages = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(point)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

  const ndviSeries = allImages.map(function (img) {
    const ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
    const value = ndvi.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: point,
      scale: 10,
    });
    return ee.Feature(null, {
      date: img.date().format('YYYY-MM-dd'),
      ndvi: value.get('NDVI'),
    });
  });

  ndviSeries
    .filter(ee.Filter.notNull(['ndvi']))
    .evaluate(function (result) {
      if (!result || !result.features) {
        callback([]);
        return;
      }
      const data = result.features.map(function (f) {
        return {
          date: f.properties.date,
          ndvi: f.properties.ndvi,
        };
      });
      callback(data);
    });
}

function renderChart(data) {
  const ctx = document.getElementById('trend-chart').getContext('2d');
  if (trendChart) trendChart.destroy();

  const labels = data.map(function (d) { return d.date; });
  const values = data.map(function (d) { return d.ndvi; });

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'NDVI',
        data: values,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#22c55e',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return 'NDVI: ' + ctx.parsed.y.toFixed(3);
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxTicksLimit: 8 },
          grid: { display: false },
        },
        y: {
          min: -0.5,
          max: 1,
          ticks: { font: { size: 10 } },
          grid: { color: '#f0f0f0' },
          title: {
            display: true,
            text: 'NDVI',
            font: { size: 11 },
          },
        },
      },
    },
  });
}

function checkStress(data) {
  const alertEl = document.getElementById('stress-alert');
  if (data.length < 2) {
    alertEl.style.display = 'none';
    return;
  }

  const sorted = data.slice().sort(function (a, b) {
    return a.date.localeCompare(b.date);
  });

  const recent = sorted[sorted.length - 1];
  if (!recent || recent.ndvi === null) {
    alertEl.style.display = 'none';
    return;
  }

  let earlier = null;
  for (let i = sorted.length - 2; i >= 0; i--) {
    const d = sorted[i];
    if (d.ndvi !== null) {
      const daysDiff = (new Date(recent.date) - new Date(d.date)) / 86400000;
      if (daysDiff >= 14) {
        earlier = d;
        break;
      }
    }
  }

  if (!earlier || !earlier.ndvi) {
    alertEl.style.display = 'none';
    return;
  }

  const drop = ((earlier.ndvi - recent.ndvi) / earlier.ndvi) * 100;
  if (drop > 15) {
    alertEl.textContent = `⚠ Possible stress detected — NDVI dropped ${drop.toFixed(0)}% (${earlier.date} → ${recent.date})`;
    alertEl.style.display = 'block';
  } else {
    alertEl.style.display = 'none';
  }
}

function setStatus(state, text) {
  const bar = document.getElementById('status-bar');
  bar.textContent = text;
  bar.className = `status-bar ${state}`;
}
