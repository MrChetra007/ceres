const EE_PROJECT_ID = 'gen-lang-client-0978198347';
const CLIENT_ID = '355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com';
var aoiCoords = null;
function defaultAoiCoords() { return [102.985, 12.845, 103.048, 12.898]; }
function loadAoiCoords() {
  var saved = localStorage.getItem('ndvi_aoi');
  aoiCoords = saved ? JSON.parse(saved) : defaultAoiCoords();
}
function saveAoiCoords(coords) {
  aoiCoords = coords;
  localStorage.setItem('ndvi_aoi', JSON.stringify(aoiCoords));
}
const NDVI_VIS = { min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] };
const NDWI_VIS = { min: -1, max: 1, palette: ['brown', 'tan', '#e0f0ff', '#4a90d9', '#003366'] };
const LSWI_VIS = { min: -0.3, max: 0.6, palette: ['tan', 'lightblue', 'darkblue'] };

const INDICES = {
  ndvi: { name: 'NDVI', bands: ['B8', 'B4'], vis: NDVI_VIS, label: 'Vegetation' },
  ndwi: { name: 'NDWI', bands: ['B3', 'B8'], vis: NDWI_VIS, label: 'Water' },
  lswi: { name: 'LSWI', bands: ['B8', 'B11'], vis: LSWI_VIS, label: 'Water/Moisture' },
};

function buildMonths() {
  var names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var months = [];
  var d = new Date();
  for (var i = 13; i >= 0; i--) {
    var dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push({ year: dt.getFullYear(), month: dt.getMonth() + 1, label: names[dt.getMonth()] + ' ' + dt.getFullYear() });
  }
  return months;
}
var MONTHS = buildMonths();

var PRESETS = [
  { label: 'Cement Factory', lat: 12.8715, lng: 103.0165, zoom: 15 },
  { label: 'Factory North', lat: 12.890, lng: 103.020, zoom: 14 },
  { label: 'Factory South', lat: 12.855, lng: 103.010, zoom: 14 },
];

function loadPresets() {
  var saved = localStorage.getItem('ndvi_presets');
  if (saved) { PRESETS = JSON.parse(saved); }
}
function savePresets() {
  localStorage.setItem('ndvi_presets', JSON.stringify(PRESETS));
  renderPresets();
}

function renderPresets() {
  var container = document.getElementById('preset-panel');
  container.querySelectorAll('.preset-btn').forEach(function (b) { b.remove(); });
  PRESETS.forEach(function (p) {
    var btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.dataset.lat = p.lat;
    btn.dataset.lng = p.lng;
    btn.dataset.zoom = p.zoom;
    btn.textContent = p.label;
    container.appendChild(btn);
  });
}

function showPresetEditor() {
  var overlay = document.getElementById('preset-editor');
  if (!overlay) return;
  overlay.style.display = 'flex';
  var list = document.getElementById('preset-editor-list');
  list.innerHTML = PRESETS.map(function (p, i) {
    return (
      '<div class="preset-editor-row" data-idx="' + i + '">' +
        '<input class="pe-name" value="' + escapeHtml(p.label) + '" placeholder="Label" />' +
        '<input class="pe-lat" type="number" step="0.0001" value="' + p.lat + '" placeholder="Lat" />' +
        '<input class="pe-lng" type="number" step="0.0001" value="' + p.lng + '" placeholder="Lng" />' +
        '<input class="pe-zoom" type="number" min="1" max="19" value="' + (p.zoom || 14) + '" placeholder="Zoom" />' +
        '<button class="pe-delete" data-idx="' + i + '"><i class="ti ti-trash"></i></button>' +
      '</div>'
    );
  }).join('');

  document.getElementById('pe-add-current').onclick = function () {
    var c = map.getCenter();
    var z = map.getZoom();
    PRESETS.push({ label: 'New location', lat: c.lat, lng: c.lng, zoom: z });
    savePresets();
    showPresetEditor();
  };

  document.getElementById('pe-reset').onclick = function () {
    localStorage.removeItem('ndvi_presets');
    loadPresets();
    renderPresets();
    showPresetEditor();
  };

  document.getElementById('pe-save').onclick = function () {
    list.querySelectorAll('.preset-editor-row').forEach(function (row) {
      var idx = parseInt(row.dataset.idx);
      PRESETS[idx] = {
        label: row.querySelector('.pe-name').value.trim(),
        lat: parseFloat(row.querySelector('.pe-lat').value),
        lng: parseFloat(row.querySelector('.pe-lng').value),
        zoom: parseInt(row.querySelector('.pe-zoom').value) || 14,
      };
    });
    savePresets();
    overlay.style.display = 'none';
  };

  document.getElementById('pe-cancel').onclick = function () {
    overlay.style.display = 'none';
  };

  list.querySelectorAll('.pe-delete').forEach(function (btn) {
    btn.onclick = function () {
      PRESETS.splice(parseInt(btn.dataset.idx), 1);
      savePresets();
      showPresetEditor();
    };
  });
}

function updateAoiRectangle() {
  if (!aoiCoords) return;
  if (aoiRectangle) map.removeLayer(aoiRectangle);
  aoiRectangle = L.rectangle([[aoiCoords[1], aoiCoords[0]], [aoiCoords[3], aoiCoords[2]]], {
    color: '#ff4444', weight: 2, fill: false, dashArray: '4 4',
  }).addTo(map);
}

function showAoiEditor() {
  var overlay = document.getElementById('aoi-editor');
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.getElementById('ae-west').value = aoiCoords[0];
  document.getElementById('ae-south').value = aoiCoords[1];
  document.getElementById('ae-east').value = aoiCoords[2];
  document.getElementById('ae-north').value = aoiCoords[3];

  document.getElementById('ae-apply').onclick = function () {
    var w = parseFloat(document.getElementById('ae-west').value);
    var s = parseFloat(document.getElementById('ae-south').value);
    var e = parseFloat(document.getElementById('ae-east').value);
    var n = parseFloat(document.getElementById('ae-north').value);
    if (isNaN(w) || isNaN(s) || isNaN(e) || isNaN(n)) {
      showToast('All four coordinates must be valid numbers');
      return;
    }
    saveAoiCoords([w, s, e, n]);
    overlay.style.display = 'none';
    updateAoiRectangle();
    map.setView([(s + n) / 2, (w + e) / 2], 14);
    setStatus('computing', 'Reloading NDVI for new AOI...');
    fetchDryMonths();
    loadNdviForMonth(parseInt(document.getElementById('month-slider').value), currentGeometry);
  };

  document.getElementById('ae-cancel').onclick = function () {
    overlay.style.display = 'none';
  };

  document.getElementById('ae-reset').onclick = function () {
    saveAoiCoords(defaultAoiCoords());
    overlay.style.display = 'none';
    updateAoiRectangle();
    map.setView([12.8715, 103.0165], 14);
    setStatus('computing', 'Reloading NDVI for default AOI...');
    fetchDryMonths();
    loadNdviForMonth(parseInt(document.getElementById('month-slider').value), currentGeometry);
  };
}

function updateSceneCount(count, isRight) {
  var el = document.getElementById(isRight ? 'scene-count-right' : 'scene-count');
  if (!el) return;
  if (count === 0) { el.textContent = ''; el.className = 'scene-count'; return; }
  var dot = count <= 2 ? '\u25CF ' : '';
  el.textContent = '\u00b7 ' + dot + count + ' scene' + (count !== 1 ? 's' : '');
  el.className = 'scene-count' + (count <= 2 ? ' scene-count-low' : '');
}

function setupSliders() {
  var last = MONTHS.length - 1;
  var latest = Math.max(0, MONTHS.length - 2);
  var ls = document.getElementById('month-slider');
  var rs = document.getElementById('month-slider-right');
  ls.min = 0; ls.max = last; ls.value = latest;
  rs.min = 0; rs.max = last; rs.value = Math.max(0, latest - 3);

  var groups = document.querySelectorAll('.slider-group');
  if (groups[0]) {
    var lbls = groups[0].querySelectorAll('.slider-label');
    if (lbls[0]) lbls[0].textContent = MONTHS[0].label;
    if (lbls[1]) lbls[1].textContent = MONTHS[last].label;
  }
  if (groups[1]) {
    var lbls2 = groups[1].querySelectorAll('.slider-label');
    if (lbls2[0]) lbls2[0].textContent = MONTHS[0].label;
    if (lbls2[1]) lbls2[1].textContent = MONTHS[last].label;
  }
  document.getElementById('month-label').textContent = MONTHS[latest].label;
  document.getElementById('month-label-right').textContent = MONTHS[0].label;
}

const EVENTS = [
  { year: 2025, month: 8,  label: 'Flood', type: 'flood' },
  { year: 2025, month: 9,  label: 'Flood', type: 'flood' },
  { year: 2026, month: 1,  label: 'Dry spell', type: 'drought' },
  { year: 2026, month: 2,  label: 'Dry spell', type: 'drought' },
  { year: 2026, month: 3,  label: 'Dry spell', type: 'drought' },
];

const EVENT_COLORS = { flood: '#3b82f6', drought: '#f59e0b' };
const DRY_MONTH_THRESHOLD = 50;
var dryMonthSet = new Set();

function fetchDryMonths() {
  var geom = ee.Geometry.Rectangle(aoiCoords);
  dryMonthSet.clear();
  var pending = MONTHS.length;
  MONTHS.forEach(function (m, i) {
    var start = ee.Date.fromYMD(m.year, m.month, 1);
    var end = start.advance(1, 'month');
    ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
      .filterDate(start, end)
      .filterBounds(geom)
      .sum()
      .reduceRegion({ reducer: ee.Reducer.mean(), geometry: geom, scale: 5000, maxPixels: 1e9 })
      .evaluate(function (result) {
        var mm = result && result.precipitation;
        if (mm != null && mm < DRY_MONTH_THRESHOLD) dryMonthSet.add(i);
        pending--;
        if (pending === 0) {
          renderEventMarkers();
          renderEventMarkersRight();
        }
      });
  });
}

const RICE_GROWTH_STAGES = [
  { maxDay: 10,  stage: 'Transplanting',                min: -0.1, max: 0.3 },
  { maxDay: 30,  stage: 'Tillering',                    min: 0.3,  max: 0.55 },
  { maxDay: 55,  stage: 'Stem Elongation / Booting',    min: 0.5,  max: 0.75 },
  { maxDay: 75,  stage: 'Flowering / Heading',           min: 0.6,  max: 0.85 },
  { maxDay: 100, stage: 'Grain Filling / Maturity',      min: 0.4,  max: 0.7 },
  { maxDay: 130, stage: 'Harvest / Senescence',          min: -0.1, max: 0.4 },
];

function getGrowthStage(daysSincePlanting) {
  for (var i = 0; i < RICE_GROWTH_STAGES.length; i++) {
    if (daysSincePlanting <= RICE_GROWTH_STAGES[i].maxDay) return RICE_GROWTH_STAGES[i];
  }
  return RICE_GROWTH_STAGES[RICE_GROWTH_STAGES.length - 1];
}

loadAoiCoords();
setupSliders();
const map = L.map('map', { center: [12.8715, 103.0165], zoom: 14 });
var baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

let mapRight = null;
let syncing = false;
let aoiRectangle = null;
let baseLayerRight = null;
let currentBase = 'street';

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  position: 'topright',
  draw: {
    polygon: { showArea: true, metric: ['ha'] },
    rectangle: { showArea: true, metric: ['ha'] },
    marker: false,
    circle: false,
    circlemarker: false,
    polyline: false,
  },
  edit: { featureGroup: drawnItems },
});
map.addControl(drawControl);
updateAoiRectangle();

let ndviLayer = null;
let ndviLayerRight = null;
let debounceTimer = null;
let debounceTimerRight = null;
let trendChart = null;
let currentGeometry = null;
let currentIndex = 'ndvi';
let compareMode = false;
let loadingCount = 0;
let currentFieldName = null;
let currentFieldId = null;

document.getElementById('sign-in-btn').addEventListener('click', authenticate);

document.getElementById('month-slider').addEventListener('input', function () {
  clearTimeout(debounceTimer);
  setSliderLoading(true);
  debounceTimer = setTimeout(function () {
    loadNdviForMonth(parseInt(document.getElementById('month-slider').value), currentGeometry);
  }, 300);
});

document.getElementById('month-slider-right').addEventListener('input', function () {
  clearTimeout(debounceTimerRight);
  setSliderLoading(true);
  debounceTimerRight = setTimeout(function () {
    loadNdviForMonthRight(parseInt(document.getElementById('month-slider-right').value));
  }, 300);
});

document.getElementById('close-panel').addEventListener('click', function () {
  document.getElementById('info-panel').style.display = 'none';
});

document.getElementById('export-btn-header').addEventListener('click', function () {
  var menu = document.getElementById('export-menu');
  menu.hidden = !menu.hidden;
});

document.querySelectorAll('#export-menu button').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.getElementById('export-menu').hidden = true;
    if (btn.dataset.format === 'png') exportChart();
    else exportPdf();
  });
});

document.addEventListener('click', function (e) {
  var container = document.getElementById('export-btn-header').parentElement;
  if (!container.contains(e.target)) {
    document.getElementById('export-menu').hidden = true;
  }
});

document.getElementById('dashboard-toggle').addEventListener('click', function () {
  document.getElementById('dashboard').style.display = 'flex';
});

document.getElementById('dashboard-close').addEventListener('click', function () {
  document.getElementById('dashboard').style.display = 'none';
});

document.getElementById('compare-toggle').addEventListener('change', function () {
  compareMode = this.checked;
  var rightMap = document.getElementById('map-right');
  var rightSlider = document.getElementById('slider-group-right');

  if (compareMode) {
    rightMap.style.display = 'block';
    rightSlider.style.display = 'block';

    if (!mapRight) {
      mapRight = L.map('map-right', { center: [12.8715, 103.0165], zoom: 14 });
      baseLayerRight = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
    rightMap.style.display = 'none';
    rightSlider.style.display = 'none';
    map.invalidateSize();
  }
});

document.querySelectorAll('.segmented-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    if (!btn.dataset.index) return;
    document.querySelectorAll('.segmented-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentIndex = btn.dataset.index;
    var idx = parseInt(document.getElementById('month-slider').value);
    setSliderLoading(true);
    loadNdviForMonth(idx, currentGeometry);
    if (compareMode) {
      loadNdviForMonthRight(parseInt(document.getElementById('month-slider-right').value));
    }
    renderFieldList();
  });
});

loadPresets();
renderPresets();
document.getElementById('preset-manage-btn').addEventListener('click', function (e) {
  e.stopPropagation();
  showPresetEditor();
});
document.getElementById('preset-panel').addEventListener('click', function (e) {
  var btn = e.target.closest('.preset-btn');
  if (!btn) return;
  var lat = parseFloat(btn.dataset.lat);
  var lng = parseFloat(btn.dataset.lng);
  var zoom = parseInt(btn.dataset.zoom) || 14;
  map.setView([lat, lng], zoom);
  setStatus('ready', 'Flying to ' + btn.textContent);
});

document.getElementById('aoi-btn').addEventListener('click', function () {
  showAoiEditor();
});

document.querySelectorAll('.base-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.base-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    setBaseLayer(btn.dataset.base);
  });
});

document.getElementById('latest-btn').addEventListener('click', function () {
  var latest = Math.max(0, MONTHS.length - 2);
  document.getElementById('month-slider').value = latest;
  setSliderLoading(true);
  loadNdviForMonth(latest, currentGeometry);
  if (compareMode) {
    document.getElementById('month-slider-right').value = latest;
    loadNdviForMonthRight(latest);
  }
});

document.getElementById('search-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') searchPlace(this.value);
});
document.getElementById('search-btn').addEventListener('click', function () {
  searchPlace(document.getElementById('search-input').value);
});

document.getElementById('help-btn').addEventListener('click', function () {
  document.getElementById('help-overlay').style.display = 'flex';
});

document.getElementById('help-close').addEventListener('click', function () {
  document.getElementById('help-overlay').style.display = 'none';
});

document.getElementById('help-overlay').addEventListener('click', function (e) {
  if (e.target === this) this.style.display = 'none';
});

document.getElementById('aoi-editor').addEventListener('click', function (e) {
  if (e.target === this) this.style.display = 'none';
});

map.on('click', function (e) {
  var lat = e.latlng.lat;
  var lng = e.latlng.lng;
  currentFieldName = null;
  currentFieldId = null;
  document.getElementById('chart-subtitle').textContent =
    lat.toFixed(4) + ', ' + lng.toFixed(4);
  document.getElementById('info-panel').style.display = 'flex';
  setStatus('computing', 'Fetching NDVI trend...');
  getNdviTimeSeriesAtPoint(lat, lng, function (data) {
    if (data.length === 0) {
      setStatus('error', 'No NDVI data for this point');
      return;
    }
    renderChart(data);
    checkStress(data, lat, lng);
    document.getElementById('chart-subtitle').textContent += ' \u00b7 ' + data.length + ' observations';
    setStatus('ready', 'NDVI trend loaded \u2014 ' + data.length + ' observations');
  });
});

map.on(L.Draw.Event.EDITSTART, function () {
  if (drawnItems.getLayers().length === 0) {
    showToast('Draw a field on the map first, then edit');
    if (drawControl && drawControl._toolbars && drawControl._toolbars.edit) {
      drawControl._toolbars.edit.disable();
    }
  }
});

map.on(L.Draw.Event.CREATED, function (e) {
  drawnItems.addLayer(e.layer);
  updateDrawEditVisibility();
  promptSaveField(e.layer.toGeoJSON());
});

map.on(L.Draw.Event.EDITED, function () {
  var layers = [];
  drawnItems.eachLayer(function (l) { layers.push(l.toGeoJSON()); });
  if (layers.length > 0 && currentFieldId) {
    var fields = getSavedFields();
    var field = fields.find(function (f) { return f.id === currentFieldId; });
    if (field) {
      field.geojson = layers[0];
      field.areaHectares = getFieldAreaHectares(layers[0]);
      localStorage.setItem('ndvi_fields', JSON.stringify(fields));
      renderFieldList();
    }
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

function updateDrawEditVisibility() {
  var visible = drawnItems.getLayers().length > 0;
  var sections = document.querySelectorAll('.leaflet-draw-section');
  sections.forEach(function (s) {
    if (s.querySelector('.leaflet-draw-edit-edit, .leaflet-draw-edit-remove')) {
      s.style.display = visible ? '' : 'none';
    }
  });
}

function setSliderLoading(active) {
  var panel = document.getElementById('slider-panel');
  if (active) {
    loadingCount++;
    panel.classList.add('loading');
  } else {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) panel.classList.remove('loading');
  }
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
      map.invalidateSize();
      map.setView([12.8715, 103.0165], 14);
      renderEventMarkers();
      fetchDryMonths();
      renderFieldList();
      updateDrawEditVisibility();
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

function renderEventMarkers() {
  renderEventMarkersFor('event-markers');
}

function renderEventMarkersRight() {
  renderEventMarkersFor('event-markers-right');
}

function renderEventMarkersFor(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = (
    '<div class="event-markers-row">' +
      MONTHS.map(function (m, i) {
        var event = EVENTS.find(function (e) { return e.year === m.year && e.month === m.month; });
        if (event) {
          return '<div class="event-marker" style="background:' + EVENT_COLORS[event.type] + '" title="' + event.label + '"></div>';
        }
        return '<div class="event-marker" style="background:transparent"></div>';
      }).join('') +
    '</div>' +
    '<div class="auto-markers-row">' +
      MONTHS.map(function (m, i) {
        if (dryMonthSet.has(i)) {
          return '<div class="auto-marker auto-dry" title="Low rainfall"></div>';
        }
        return '<div class="auto-marker" style="background:transparent"></div>';
      }).join('') +
    '</div>'
  );
}

function updateEventBadge(idx, badgeId) {
  var m = MONTHS[idx];
  var event = m && EVENTS.find(function (e) { return e.year === m.year && e.month === m.month; });
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
  var cfg = INDICES[currentIndex];
  document.getElementById('month-label').textContent = m.label;
  document.getElementById('scene-count').textContent = '';
  updateEventBadge(idx, 'event-badge');
  setStatus('computing', 'Computing ' + cfg.name + ' \u2014 ' + m.label + '...');

  var geom = geometry || ee.Geometry.Rectangle(aoiCoords);
  var start = ee.Date.fromYMD(m.year, m.month, 1);
  var end = start.advance(1, 'month');
  var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

  collection.size().evaluate(function (count) {
    updateSceneCount(count, false);
    if (count === 0) {
      setSliderLoading(false);
      if (ndviLayer) { map.removeLayer(ndviLayer); ndviLayer = null; }
      setStatus('error', 'No cloud-free imagery yet for ' + m.label + ' \u2014 check back later in the month');
      return;
    }

    var composite = collection.median().clip(geom).normalizedDifference(cfg.bands).rename(cfg.name);
    composite.getMap(cfg.vis, function (mapId, err) {
      setSliderLoading(false);
      if (err || !mapId?.urlFormat) {
        setStatus('error', 'No cloud-free imagery yet for ' + m.label + ' \u2014 check back later in the month');
        return;
      }
      if (ndviLayer) map.removeLayer(ndviLayer);
      ndviLayer = L.tileLayer(mapId.urlFormat, {
        attribution: 'Sentinel-2 / Google Earth Engine',
        opacity: 0.8,
      }).addTo(map);
      setStatus('ready', cfg.name + ' layer loaded \u2014 ' + m.label);
    });
  });
}

function loadNdviForMonthRight(idx) {
  var m = MONTHS[idx];
  if (!m) return;
  var cfg = INDICES[currentIndex];
  document.getElementById('month-label-right').textContent = m.label;
  document.getElementById('scene-count-right').textContent = '';
  updateEventBadge(idx, 'event-badge-right');

  var geom = currentGeometry || ee.Geometry.Rectangle(aoiCoords);
  var start = ee.Date.fromYMD(m.year, m.month, 1);
  var end = start.advance(1, 'month');
  var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

  collection.size().evaluate(function (count) {
    updateSceneCount(count, true);
    if (count === 0) {
      setSliderLoading(false);
      if (ndviLayerRight) { mapRight.removeLayer(ndviLayerRight); ndviLayerRight = null; }
      return;
    }

    var composite = collection.median().clip(geom).normalizedDifference(cfg.bands).rename(cfg.name);
    composite.getMap(cfg.vis, function (mapId, err) {
      setSliderLoading(false);
      if (err || !mapId?.urlFormat) return;
      if (ndviLayerRight) mapRight.removeLayer(ndviLayerRight);
      ndviLayerRight = L.tileLayer(mapId.urlFormat, {
        attribution: 'Sentinel-2 / Google Earth Engine',
        opacity: 0.8,
      }).addTo(mapRight);
    });
  });
}

function getSavedFields() {
  return JSON.parse(localStorage.getItem('ndvi_fields') || '[]');
}

function saveField(name, geojson, plantingDate) {
  var fields = getSavedFields();
  fields.push({
    id: crypto.randomUUID(),
    name: name,
    geojson: geojson,
    areaHectares: getFieldAreaHectares(geojson),
    plantingDate: plantingDate || null,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  renderFieldList();
}

function clearFieldSelection() {
  currentFieldId = null;
  currentFieldName = null;
  currentGeometry = null;
  drawnItems.clearLayers();
  updateDrawEditVisibility();
  setBaseLayer(currentBase);
  loadNdviForMonth(parseInt(document.getElementById('month-slider').value), null);
  if (compareMode) {
    loadNdviForMonthRight(parseInt(document.getElementById('month-slider-right').value));
  }
  renderFieldList();
  setStatus('ready', 'Field deselected — showing full AOI');
}

function deleteField(id) {
  var fields = getSavedFields().filter(function (f) { return f.id !== id; });
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  if (id === currentFieldId) {
    currentFieldId = null;
    currentFieldName = null;
    currentGeometry = null;
    drawnItems.clearLayers();
    updateDrawEditVisibility();
    setBaseLayer(currentBase);
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
    updateDrawEditVisibility();
    return;
  }
  showDatePicker(null, function (date) {
    if (date === undefined) { date = null; }
    saveField(name, geojson, date);
    var fields = getSavedFields();
    loadFieldById(fields[fields.length - 1].id);
  });
}

function loadFieldById(id) {
  var fields = getSavedFields();
  var field = fields.find(function (f) { return f.id === id; });
  if (!field) return;
  loadField(field);
}

function loadField(field) {
  currentFieldName = field.name;
  currentFieldId = field.id;
  drawnItems.clearLayers();
  var geo = L.geoJSON(field.geojson);
  geo.eachLayer(function (l) { drawnItems.addLayer(l); });
  updateDrawEditVisibility();
  map.fitBounds(geo.getBounds());

  var geom = field.geojson && (field.geojson.geometry || field.geojson);
  if (!geom || !geom.coordinates) {
    setStatus('error', 'Field has invalid geometry');
    return;
  }
  var coords = geom.coordinates;
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
    var plantInfo = f.plantingDate ? f.plantingDate : 'No date';
    var ha = formatHectares(getOrComputeArea(f));
    var warn = getAreaWarning(getOrComputeArea(f));
    var activeClass = f.id === currentFieldId ? ' active' : '';
    return (
      '<div class="field-card panel' + activeClass + '" data-id="' + f.id + '">' +
        '<div class="field-card-header">' +
          '<div>' +
            '<p class="panel-title">' + escapeHtml(f.name) + '</p>' +
            '<p class="panel-subtitle" id="stage-' + f.id + '">Loading\u2026</p>' +
          '</div>' +
          '<span class="status-badge" id="badge-' + f.id + '">\u2014</span>' +
        '</div>' +
        '<div class="field-card-stats" id="stats-' + f.id + '">' +
          '<span><i class="ti ti-ruler-2"></i> ' + ha + '</span>' +
          '<span><i class="ti ti-calendar"></i> ' + plantInfo +
            ' <button class="plant-date-btn" data-id="' + f.id + '" title="Set planting date"><i class="ti ti-edit"></i></button></span>' +
          '<span><i class="ti ti-leaf"></i> <span id="ndvi-' + f.id + '">\u2014</span></span>' +
        '</div>' +
        (warn ? '<div class="field-area-warning">' + warn + '</div>' : '') +
        '<button class="delete-btn" data-id="' + f.id + '">\u2715</button>' +
      '</div>'
    );
  }).join('');

  fields.forEach(function (f) { updateFieldStatus(f); });

  container.querySelectorAll('.field-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.classList.contains('delete-btn')) return;
      if (card.dataset.id === currentFieldId) {
        clearFieldSelection();
        return;
      }
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

  container.querySelectorAll('.plant-date-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var fields = getSavedFields();
      var field = fields.find(function (f) { return f.id === btn.dataset.id; });
      if (!field) return;
      showDatePicker(field.plantingDate, function (newDate) {
        if (newDate === undefined) return;
        field.plantingDate = newDate;
        localStorage.setItem('ndvi_fields', JSON.stringify(fields));
        renderFieldList();
      });
    });
  });
}

function getAreaWarning(hectares) {
  if (hectares > 50) return 'Unusually large for one field \u2014 check the drawn shape?';
  return null;
}

function buildStatusObject(field, value, index) {
  index = index || 'ndvi';
  if (index !== 'ndvi') {
    if (index === 'ndwi') {
      var cls = value > 0.3 ? 'water' : value > 0 ? 'moist' : 'dry';
      var lbl = value > 0.3 ? 'Water' : value > 0 ? 'Moist' : 'Dry';
      return { badgeClass: cls, badgeText: lbl, stageLabel: 'NDWI ' + value.toFixed(2) };
    }
    if (index === 'lswi') {
      return { badgeClass: 'lswi', badgeText: 'LSWI', stageLabel: 'LSWI ' + value.toFixed(2) };
    }
    return { badgeClass: '', badgeText: '', stageLabel: '' };
  }
  if (!field.plantingDate) {
    var cls2, lbl2;
    if (value > 0.6) { cls2 = 'healthy'; lbl2 = 'Healthy'; }
    else if (value > 0.3) { cls2 = 'moderate'; lbl2 = 'Moderate'; }
    else { cls2 = 'stressed'; lbl2 = 'Stressed'; }
    return { badgeClass: cls2, badgeText: lbl2, stageLabel: 'NDVI ' + value.toFixed(2) };
  }
  var daysSincePlanting = Math.floor((Date.now() - new Date(field.plantingDate).getTime()) / 86400000);
  if (daysSincePlanting < 0) return { badgeClass: 'moderate', badgeText: 'Check date', stageLabel: 'Planting date is in the future' };
  var stage = getGrowthStage(daysSincePlanting);
  var cls3, lbl3;
  if (value >= stage.min && value <= stage.max) {
    cls3 = 'healthy'; lbl3 = 'Healthy';
  } else if (value < stage.min) {
    var deficit = stage.min - value;
    if (deficit > 0.15) { cls3 = 'stressed'; lbl3 = 'Stressed'; }
    else { cls3 = 'moderate'; lbl3 = 'Below expected'; }
  } else {
    cls3 = 'healthy'; lbl3 = 'Healthy';
  }
  return {
    badgeClass: cls3,
    badgeText: lbl3,
    stageLabel: stage.stage + ' \u00b7 Day ' + daysSincePlanting + ' \u00b7 NDVI ' + value.toFixed(2),
  };
}

function updateFieldStatus(field) {
  var geom = field.geojson && (field.geojson.geometry || field.geojson);
  if (!geom || !geom.coordinates) return;
  var coords = geom.coordinates;
  var geometry = ee.Geometry.Polygon(coords);

  var cfg = INDICES[currentIndex];
  var start = ee.Date(Date.now()).advance(-1, 'month');
  var end = ee.Date(Date.now());
  var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

  collection.size().evaluate(function (count) {
    var badge = document.getElementById('badge-' + field.id);
    var stage = document.getElementById('stage-' + field.id);
    var ndvi = document.getElementById('ndvi-' + field.id);
    if (!badge) return;
    if (count === 0) {
      badge.textContent = '\u2014';
      badge.className = 'status-badge';
      if (stage) stage.textContent = 'No recent data';
      if (ndvi) ndvi.textContent = '\u2014';
      return;
    }

    var recent = collection.median().normalizedDifference(cfg.bands).rename(cfg.name);
    var meanVal = recent.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geometry,
      scale: 10,
      maxPixels: 1e9,
    });
    meanVal.evaluate(function (result) {
      if (!badge) return;
      var value = result && result[cfg.name];
      if (value == null || value === undefined) {
        badge.textContent = '\u2014';
        badge.className = 'status-badge';
        if (stage) stage.textContent = 'No recent data';
        if (ndvi) ndvi.textContent = '\u2014';
        return;
      }
      var s = buildStatusObject(field, value, currentIndex);
      badge.textContent = s.badgeText;
      badge.className = 'status-badge status-' + s.badgeClass;
      if (stage) stage.textContent = s.stageLabel;
      if (ndvi) ndvi.textContent = value.toFixed(2);
    });
  });
}

function getNdviTimeSeriesAtPoint(lat, lng, callback) {
  var point = ee.Geometry.Point([lng, lat]);
  var startDate = ee.Date.fromYMD(MONTHS[0].year, MONTHS[0].month, 1);
  var last = MONTHS[MONTHS.length - 1];
  var endDate = ee.Date.fromYMD(last.year, last.month, 1).advance(1, 'month');

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

function getRainfallMm(geometry, daysBack) {
  daysBack = daysBack || 21;
  var end = ee.Date(Date.now());
  var start = end.advance(-daysBack, 'day');
  var rainfall = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    .filterDate(start, end)
    .filterBounds(geometry)
    .sum();
  return rainfall.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geometry,
    scale: 5000,
    maxPixels: 1e9,
  });
}

function checkStress(data, lat, lng) {
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
    var baseMsg = '\u26a0 Possible stress detected \u2014 NDVI dropped ' + drop.toFixed(0) + '% (' + earlier.date + ' \u2192 ' + recent.date + ')';
    alertEl.textContent = baseMsg;
    alertEl.style.display = 'block';

    if (lat != null && lng != null) {
      var point = ee.Geometry.Point([lng, lat]);
      getRainfallMm(point, 21).evaluate(function (result) {
        var mm = result && result.precipitation;
        if (mm == null) return;
        var rainNote = mm < 10
          ? ' \u2014 only ' + mm.toFixed(0) + 'mm rain in that period, drought stress is plausible'
          : ' \u2014 ' + mm.toFixed(0) + 'mm rain in that period, so low rainfall likely isn\'t the cause';
        alertEl.textContent = baseMsg + rainNote;
      });
    }
  } else {
    alertEl.style.display = 'none';
  }
}

function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._hide);
  el._hide = setTimeout(function () { el.classList.remove('show'); }, 3000);
}

function exportChart() {
  if (!trendChart) { showToast('Click a location on the map first'); return; }
  var canvas = document.getElementById('trend-chart');
  var link = document.createElement('a');
  link.download = 'NDVI_trend_report.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function exportPdf() {
  if (!trendChart) { showToast('Click a location on the map first'); return; }
  var doc = new window.jspdf.jsPDF('p', 'mm', 'a4');
  var pw = doc.internal.pageSize.getWidth();
  var y = 20;

  doc.setFontSize(18);
  doc.setTextColor(26, 26, 46);
  doc.text('NDVI Crop Health Report', pw / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Generated: ' + new Date().toLocaleDateString(), pw / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(12);
  doc.setTextColor(50, 50, 50);
  var location = currentFieldName || document.getElementById('chart-subtitle').textContent;
  doc.text('Location: ' + location, 14, y);
  y += 8;

  var lastIdx = trendChart.data.datasets[0].data.length - 1;
  if (lastIdx >= 0) {
    var lastVal = trendChart.data.datasets[0].data[lastIdx];
    var lastDate = trendChart.data.labels[lastIdx];
    var statusText = lastVal > 0.6 ? 'Healthy' : lastVal > 0.3 ? 'Moderate' : 'Stressed';
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text('Latest NDVI: ' + lastVal.toFixed(3) + ' (' + lastDate + ')', 14, y);
    y += 7;
    doc.setTextColor(lastVal > 0.6 ? 34 : lastVal > 0.3 ? 180 : 220, lastVal > 0.6 ? 197 : lastVal > 0.3 ? 160 : 38, lastVal > 0.3 ? 94 : 38);
    doc.text('Crop Health: ' + statusText, 14, y);
    y += 10;
  }

  var canvas = document.getElementById('trend-chart');
  var chartImage = canvas.toDataURL('image/png');
  doc.addImage(chartImage, 'PNG', 14, y, pw - 28, 65);
  y += 72;

  var alertEl = document.getElementById('stress-alert');
  if (alertEl.style.display !== 'none' && alertEl.textContent) {
    doc.setTextColor(133, 100, 4);
    doc.setFontSize(10);
    var lines = doc.splitTextToSize(alertEl.textContent, pw - 28);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 6;
  }

  y = Math.max(y, 200);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text('NDVI (Normalized Difference Vegetation Index) measures plant health', 14, y); y += 5;
  doc.text('using satellite imagery. Values range from -1 to 1:', 14, y); y += 5;
  doc.text('- Above 0.6: Dense, healthy vegetation', 14, y); y += 4;
  doc.text('- 0.3 to 0.6: Moderate or sparse vegetation', 14, y); y += 4;
  doc.text('- Below 0.3: Bare soil, water, or stressed crops', 14, y); y += 4;
  doc.setFontSize(8);
  doc.text('Data source: Sentinel-2 (ESA) via Google Earth Engine', 14, y + 4);

  doc.save('NDVI_Report_' + new Date().toISOString().slice(0, 10) + '.pdf');
}

function showDatePicker(currentDateStr, onResult) {
  var overlay = document.createElement('div');
  overlay.className = 'date-picker-overlay';
  overlay.innerHTML =
    '<div class="date-picker-modal">' +
      '<label>Planting date:</label>' +
      '<input type="date" value="' + (currentDateStr || '') + '">' +
      '<div class="date-picker-actions">' +
        '<button class="date-picker-cancel">Cancel</button>' +
        '<button class="date-picker-save">Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var input = overlay.querySelector('input');
  input.focus();

  function close() { document.body.removeChild(overlay); }

  overlay.querySelector('.date-picker-save').addEventListener('click', function () {
    onResult(input.value || null);
    close();
  });
  overlay.querySelector('.date-picker-cancel').addEventListener('click', function () {
    onResult(undefined);
    close();
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) { onResult(undefined); close(); }
  });
}

function getFieldAreaHectares(geojson) {
  return turf.area(geojson) / 10000;
}

function formatHectares(ha) {
  if (ha < 0.1) return ha.toFixed(3) + ' ha';
  return ha.toFixed(1) + ' ha';
}

function getOrComputeArea(field) {
  if (typeof field.areaHectares === 'number') return field.areaHectares;
  return getFieldAreaHectares(field.geojson);
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function setBaseLayer(type) {
  currentBase = type;
  var url = type === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var attr = type === 'satellite'
    ? 'Tiles &copy; Esri'
    : '&copy; OpenStreetMap contributors';

  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(map);
  map.invalidateSize();

  if (mapRight && baseLayerRight) {
    mapRight.removeLayer(baseLayerRight);
    baseLayerRight = L.tileLayer(url, { attribution: attr, maxZoom: 19 }).addTo(mapRight);
    mapRight.invalidateSize();
  }
}

function searchPlace(query) {
  if (!query || !query.trim()) return;
  var q = encodeURIComponent(query.trim());
  fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + q)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || data.length === 0) {
        showToast('Location not found');
        return;
      }
      var loc = data[0];
      map.setView([parseFloat(loc.lat), parseFloat(loc.lon)], 16);
      setStatus('ready', 'Flew to ' + loc.display_name.split(',')[0]);
    })
    .catch(function () {
      showToast('Search failed — check your connection');
    });
}

function setStatus(state, text) {
  var bar = document.getElementById('status-bar');
  bar.textContent = text;
  bar.classList.remove('hidden');
  clearTimeout(bar._fadeTimer);
  if (state === 'ready') {
    bar._fadeTimer = setTimeout(function () { bar.classList.add('hidden'); }, 2500);
  }
}
