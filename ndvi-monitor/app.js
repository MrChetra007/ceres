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

const EVENTS = [
  { monthIdx: 2, label: 'Flood', type: 'flood' },
  { monthIdx: 3, label: 'Flood', type: 'flood' },
  { monthIdx: 7, label: 'Dry spell', type: 'drought' },
  { monthIdx: 8, label: 'Dry spell', type: 'drought' },
  { monthIdx: 9, label: 'Dry spell', type: 'drought' },
];

const EVENT_COLORS = { flood: '#3b82f6', drought: '#f59e0b' };

const map = L.map('map', { center: [13.05, 103.175], zoom: 11 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

let mapRight = null;
let syncing = false;

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  draw: {
    polygon: true,
    rectangle: true,
    marker: false,
    circle: false,
    circlemarker: false,
    polyline: false,
  },
  edit: { featureGroup: drawnItems },
});
map.addControl(drawControl);

let ndviLayer = null;
let ndviLayerRight = null;
let debounceTimer = null;
let debounceTimerRight = null;
let trendChart = null;
let currentGeometry = null;
let compareMode = false;

document.getElementById('sign-in-btn').addEventListener('click', authenticate);

document.getElementById('month-slider').addEventListener('input', function () {
  clearTimeout(debounceTimer);
  document.getElementById('slider-panel').classList.add('loading');
  debounceTimer = setTimeout(function () {
    loadNdviForMonth(parseInt(document.getElementById('month-slider').value), currentGeometry);
  }, 300);
});

document.getElementById('month-slider-right').addEventListener('input', function () {
  clearTimeout(debounceTimerRight);
  document.getElementById('slider-panel').classList.add('loading');
  debounceTimerRight = setTimeout(function () {
    loadNdviForMonthRight(parseInt(document.getElementById('month-slider-right').value));
  }, 300);
});

document.getElementById('close-panel').addEventListener('click', function () {
  document.getElementById('info-panel').style.display = 'none';
});

document.getElementById('export-btn').addEventListener('click', exportChart);

document.getElementById('dashboard-toggle').addEventListener('click', function () {
  document.getElementById('dashboard').style.display = 'flex';
});

document.getElementById('dashboard-close').addEventListener('click', function () {
  document.getElementById('dashboard').style.display = 'none';
});

document.getElementById('compare-toggle').addEventListener('click', function () {
  compareMode = !compareMode;
  var btn = document.getElementById('compare-toggle');
  var rightMap = document.getElementById('map-right');
  var rightSlider = document.getElementById('slider-group-right');

  if (compareMode) {
    btn.textContent = 'Compare ON';
    btn.classList.add('active');
    rightMap.style.display = 'block';
    rightSlider.style.display = 'block';

    if (!mapRight) {
      mapRight = L.map('map-right', { center: [13.05, 103.175], zoom: 11 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRight);
      mapRight.on('move', syncLeftFromRight);
      map.on('move', syncRightFromLeft);
    }

    mapRight.setView(map.getCenter(), map.getZoom());
    map.invalidateSize();
    mapRight.invalidateSize();

    renderEventMarkersRight();
    loadNdviForMonthRight(parseInt(document.getElementById('month-slider-right').value));
  } else {
    btn.textContent = 'Compare OFF';
    btn.classList.remove('active');
    rightMap.style.display = 'none';
    rightSlider.style.display = 'none';
    map.invalidateSize();
  }
});

map.on('click', function (e) {
  var lat = e.latlng.lat;
  var lng = e.latlng.lng;
  document.getElementById('point-coords').textContent =
    'Lat: ' + lat.toFixed(4) + ', Lng: ' + lng.toFixed(4);
  document.getElementById('info-panel').style.display = 'flex';
  setStatus('computing', 'Fetching NDVI trend...');
  getNdviTimeSeriesAtPoint(lat, lng, function (data) {
    if (data.length === 0) {
      setStatus('error', 'No NDVI data for this point');
      return;
    }
    renderChart(data);
    checkStress(data);
    setStatus('ready', 'NDVI trend loaded \u2014 ' + data.length + ' observations');
  });
});

map.on(L.Draw.Event.CREATED, function (e) {
  drawnItems.addLayer(e.layer);
  promptSaveField(e.layer.toGeoJSON());
});

map.on(L.Draw.Event.EDITED, function () {
  var layers = [];
  drawnItems.eachLayer(function (l) { layers.push(l.toGeoJSON()); });
  if (layers.length > 0) {
    var fields = getSavedFields();
    var updated = fields.map(function (f) {
      f.geojson = layers[0];
      return f;
    });
    localStorage.setItem('ndvi_fields', JSON.stringify(updated));
    renderFieldList();
    loadFieldById(updated[updated.length - 1].id);
  }
});

function syncRightFromLeft() {
  if (syncing || !mapRight) return;
  syncing = true;
  mapRight.setView(map.getCenter(), map.getZoom());
  syncing = false;
}

function syncLeftFromRight() {
  if (syncing || !mapRight) return;
  syncing = true;
  map.setView(mapRight.getCenter(), mapRight.getZoom());
  syncing = false;
}

var savedCreds = localStorage.getItem('ee_auth_creds');
if (savedCreds) {
  try {
    var creds = JSON.parse(savedCreds);
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
    function () {
      var token = ee.data.getAuthToken();
      if (token) {
        localStorage.setItem('ee_auth_creds', JSON.stringify({
          access_token: token,
          expires_in: 3600,
        }));
      }
      initializeEE();
    },
    function (err) { setStatus('error', 'Auth failed: ' + (err?.message || err)); }
  );
}

function initializeEE() {
  setStatus('initializing', 'Initializing Earth Engine...');
  ee.initialize(
    null, null,
    function () {
      document.getElementById('slider-panel').style.display = 'block';
      document.getElementById('auth-overlay').style.display = 'none';
      renderEventMarkers();
      renderFieldList();
      setStatus('computing', 'Computing NDVI...');
      loadNdviForMonth(parseInt(document.getElementById('month-slider').value), null);
    },
    function (err) {
      localStorage.removeItem('ee_auth_creds');
      setStatus('error', 'Init failed: ' + (err?.message || err));
    },
    null,
    EE_PROJECT_ID
  );
}

function getNdviForMonth(year, month, geometry) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var geom = geometry || ee.Geometry.Rectangle(AOI_COORDS);
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .median()
    .normalizedDifference(['B8', 'B4'])
    .rename('NDVI');
}

function renderEventMarkers() {
  renderEventMarkersFor('event-markers');
}

function renderEventMarkersRight() {
  renderEventMarkersFor('event-markers-right');
}

function renderEventMarkersFor(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = MONTHS.map(function (m, i) {
    var event = EVENTS.find(function (e) { return e.monthIdx === i; });
    if (event) {
      return '<div class="event-marker" style="background:' + EVENT_COLORS[event.type] + '" title="' + event.label + '"></div>';
    }
    return '<div class="event-marker" style="background:transparent"></div>';
  }).join('');
}

function updateEventBadge(idx, badgeId) {
  var event = EVENTS.find(function (e) { return e.monthIdx === idx; });
  var badge = document.getElementById(badgeId);
  if (event) {
    badge.textContent = event.label;
    badge.className = 'event-badge ' + event.type;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function loadNdviForMonth(idx, geometry) {
  var m = MONTHS[idx];
  if (!m) return;
  document.getElementById('month-label').textContent = m.label;
  updateEventBadge(idx, 'event-badge');
  setStatus('computing', 'Computing NDVI \u2014 ' + m.label + '...');

  var ndvi = getNdviForMonth(m.year, m.month, geometry);
  ndvi.getMap(NDVI_VIS, function (mapId, err) {
    document.getElementById('slider-panel').classList.remove('loading');
    if (err || !mapId?.urlFormat) {
      setStatus('error', 'No data for ' + m.label + ' \u2014 try a different month');
      return;
    }
    if (ndviLayer) map.removeLayer(ndviLayer);
    ndviLayer = L.tileLayer(mapId.urlFormat, {
      attribution: 'Sentinel-2 / Google Earth Engine',
      opacity: 0.8,
    }).addTo(map);
    setStatus('ready', 'NDVI layer loaded \u2014 ' + m.label);
  });
}

function loadNdviForMonthRight(idx) {
  var m = MONTHS[idx];
  if (!m) return;
  document.getElementById('month-label-right').textContent = m.label;
  updateEventBadge(idx, 'event-badge-right');

  var ndvi = getNdviForMonth(m.year, m.month, currentGeometry);
  ndvi.getMap(NDVI_VIS, function (mapId, err) {
    document.getElementById('slider-panel').classList.remove('loading');
    if (err || !mapId?.urlFormat) return;
    if (ndviLayerRight) mapRight.removeLayer(ndviLayerRight);
    ndviLayerRight = L.tileLayer(mapId.urlFormat, {
      attribution: 'Sentinel-2 / Google Earth Engine',
      opacity: 0.8,
    }).addTo(mapRight);
  });
}

function getSavedFields() {
  return JSON.parse(localStorage.getItem('ndvi_fields') || '[]');
}

function saveField(name, geojson) {
  var fields = getSavedFields();
  fields.push({
    id: crypto.randomUUID(),
    name: name,
    geojson: geojson,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  renderFieldList();
}

function deleteField(id) {
  var fields = getSavedFields().filter(function (f) { return f.id !== id; });
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  if (fields.length === 0) {
    drawnItems.clearLayers();
    currentGeometry = null;
    loadNdviForMonth(parseInt(document.getElementById('month-slider').value), null);
    if (compareMode) {
      loadNdviForMonthRight(parseInt(document.getElementById('month-slider-right').value));
    }
  }
  renderFieldList();
}

function promptSaveField(geojson) {
  var name = prompt('Name this field (e.g. "North paddy \u2014 Svay Cheat"):');
  if (!name) {
    var layers = drawnItems.getLayers();
    drawnItems.removeLayer(layers[layers.length - 1]);
    return;
  }
  saveField(name, geojson);
  var fields = getSavedFields();
  loadFieldById(fields[fields.length - 1].id);
}

function loadFieldById(id) {
  var fields = getSavedFields();
  var field = fields.find(function (f) { return f.id === id; });
  if (!field) return;
  loadField(field);
}

function loadField(field) {
  drawnItems.clearLayers();
  var layer = L.geoJSON(field.geojson).addTo(drawnItems);
  map.fitBounds(layer.getBounds());

  var coords = field.geojson.geometry.coordinates;
  var eeGeometry = ee.Geometry.Polygon(coords);
  currentGeometry = eeGeometry;

  document.getElementById('info-panel').style.display = 'none';
  loadNdviForMonth(parseInt(document.getElementById('month-slider').value), eeGeometry);
  if (compareMode) {
    loadNdviForMonthRight(parseInt(document.getElementById('month-slider-right').value));
  }
}

function renderFieldList() {
  var container = document.getElementById('field-list');
  var fields = getSavedFields();

  if (fields.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = fields.map(function (f) {
    return (
      '<div class="field-card" data-id="' + f.id + '">' +
        '<div class="field-name">' + escapeHtml(f.name) + '</div>' +
        '<div class="field-status" id="status-' + f.id + '">Loading\u2026</div>' +
        '<button class="delete-btn" data-id="' + f.id + '">\u2715</button>' +
      '</div>'
    );
  }).join('');

  fields.forEach(function (f) { updateFieldStatus(f); });

  container.querySelectorAll('.field-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.classList.contains('delete-btn')) return;
      var field = fields.find(function (f) { return f.id === card.dataset.id; });
      if (field) loadField(field);
    });
  });

  container.querySelectorAll('.delete-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteField(btn.dataset.id);
    });
  });
}

function updateFieldStatus(field) {
  var coords = field.geojson.geometry.coordinates;
  var geometry = ee.Geometry.Polygon(coords);

  var recent = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(ee.Date(Date.now()).advance(-1, 'month'), ee.Date(Date.now()))
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .median()
    .normalizedDifference(['B8', 'B4'])
    .rename('NDVI');

  var meanNdvi = recent.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geometry,
    scale: 10,
    maxPixels: 1e9,
  });

  meanNdvi.evaluate(function (result) {
    var el = document.getElementById('status-' + field.id);
    if (!el) return;
    var value = result && result.NDVI;
    if (value == null || value === undefined) {
      el.textContent = 'No recent data';
      return;
    }
    var label = value > 0.6 ? '\ud83d\udfe2 Healthy' : value > 0.3 ? '\ud83d\udfe1 Moderate' : '\ud83d\udd34 Stressed';
    el.textContent = label + ' (' + value.toFixed(2) + ')';
  });
}

function getNdviTimeSeriesAtPoint(lat, lng, callback) {
  var point = ee.Geometry.Point([lng, lat]);
  var startDate = ee.Date('2025-06-01');
  var endDate = ee.Date('2026-07-01');

  var allImages = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(point)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

  var ndviSeries = allImages.map(function (img) {
    var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
    var value = ndvi.reduceRegion({
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
      var data = result.features.map(function (f) {
        return {
          date: f.properties.date,
          ndvi: f.properties.ndvi,
        };
      });
      callback(data);
    });
}

function renderChart(data) {
  var ctx = document.getElementById('trend-chart').getContext('2d');
  if (trendChart) trendChart.destroy();

  var labels = data.map(function (d) { return d.date; });
  var values = data.map(function (d) { return d.ndvi; });

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
  var alertEl = document.getElementById('stress-alert');
  if (data.length < 2) {
    alertEl.style.display = 'none';
    return;
  }

  var sorted = data.slice().sort(function (a, b) {
    return a.date.localeCompare(b.date);
  });

  var recent = sorted[sorted.length - 1];
  if (!recent || recent.ndvi === null) {
    alertEl.style.display = 'none';
    return;
  }

  var earlier = null;
  for (var i = sorted.length - 2; i >= 0; i--) {
    var d = sorted[i];
    if (d.ndvi !== null) {
      var daysDiff = (new Date(recent.date) - new Date(d.date)) / 86400000;
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

  var drop = ((earlier.ndvi - recent.ndvi) / earlier.ndvi) * 100;
  if (drop > 15) {
    alertEl.textContent = '\u26a0 Possible stress detected \u2014 NDVI dropped ' + drop.toFixed(0) + '% (' + earlier.date + ' \u2192 ' + recent.date + ')';
    alertEl.style.display = 'block';
  } else {
    alertEl.style.display = 'none';
  }
}

function exportChart() {
  if (!trendChart) return;
  var canvas = document.getElementById('trend-chart');
  var link = document.createElement('a');
  link.download = 'NDVI_trend_report.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function setStatus(state, text) {
  var bar = document.getElementById('status-bar');
  bar.textContent = text;
  bar.className = 'status-bar ' + state;
}
