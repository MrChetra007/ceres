const EE_PROJECT_ID = 'gen-lang-client-0978198347';
const CLIENT_ID = '355514869488-q3v52vvkb7c3gikr0og89o26m51ev403.apps.googleusercontent.com';
const AOI_COORDS = [103.10, 12.95, 103.25, 13.05];
const NDVI_VIS = { min: -0.2, max: 0.8, palette: ['red', 'yellow', 'green'] };
const NDWI_VIS = { min: -1, max: 1, palette: ['brown', 'tan', '#e0f0ff', '#4a90d9', '#003366'] };

const INDICES = {
  ndvi: { name: 'NDVI', bands: ['B8', 'B4'], vis: NDVI_VIS, label: 'Vegetation' },
  ndwi: { name: 'NDWI', bands: ['B3', 'B8'], vis: NDWI_VIS, label: 'Water' },
};

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

document.getElementById('export-btn').addEventListener('click', exportChart);
document.getElementById('export-pdf-btn').addEventListener('click', exportPdf);
document.getElementById('export-png-slider').addEventListener('click', exportChart);
document.getElementById('export-pdf-slider').addEventListener('click', exportPdf);

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

document.getElementById('index-toggle-btn').className = 'index-btn ndvi';
document.getElementById('index-toggle-btn').addEventListener('click', function () {
  currentIndex = currentIndex === 'ndvi' ? 'ndwi' : 'ndvi';
  var btn = document.getElementById('index-toggle-btn');
  btn.textContent = currentIndex === 'ndvi' ? 'NDWI' : 'NDVI';
  btn.className = 'index-btn ' + currentIndex;
  var idx = parseInt(document.getElementById('month-slider').value);
  setSliderLoading(true);
  loadNdviForMonth(idx, currentGeometry);
  if (compareMode) {
    loadNdviForMonthRight(parseInt(document.getElementById('month-slider-right').value));
  }
  renderFieldList();
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

document.getElementById('help-btn').addEventListener('click', function () {
  document.getElementById('help-overlay').style.display = 'flex';
});

document.getElementById('help-close').addEventListener('click', function () {
  document.getElementById('help-overlay').style.display = 'none';
});

document.getElementById('help-overlay').addEventListener('click', function (e) {
  if (e.target === this) this.style.display = 'none';
});

map.on('click', function (e) {
  var lat = e.latlng.lat;
  var lng = e.latlng.lng;
  currentFieldName = null;
  currentFieldId = null;
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
      renderEventMarkers();
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

function getIndexImage(year, month, geometry, index) {
  index = index || currentIndex;
  var cfg = INDICES[index];
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  var geom = geometry || ee.Geometry.Rectangle(AOI_COORDS);
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geom)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .median()
    .normalizedDifference(cfg.bands)
    .rename(cfg.name);
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
  var cfg = INDICES[currentIndex];
  document.getElementById('month-label').textContent = m.label;
  updateEventBadge(idx, 'event-badge');
  setStatus('computing', 'Computing ' + cfg.name + ' \u2014 ' + m.label + '...');

  var img = getIndexImage(m.year, m.month, geometry);
  img.getMap(cfg.vis, function (mapId, err) {
    setSliderLoading(false);
    if (err || !mapId?.urlFormat) {
      setStatus('error', 'No data for ' + m.label + ' \u2014 try a different month');
      return;
    }
    if (ndviLayer) map.removeLayer(ndviLayer);
    ndviLayer = L.tileLayer(mapId.urlFormat, {
      attribution: 'Sentinel-2 / Google Earth Engine',
      opacity: 0.8,
    }).addTo(map);
    setStatus('ready', cfg.name + ' layer loaded \u2014 ' + m.label);
  });
}

function loadNdviForMonthRight(idx) {
  var m = MONTHS[idx];
  if (!m) return;
  var cfg = INDICES[currentIndex];
  document.getElementById('month-label-right').textContent = m.label;
  updateEventBadge(idx, 'event-badge-right');

  var img = getIndexImage(m.year, m.month, currentGeometry);
  img.getMap(cfg.vis, function (mapId, err) {
    setSliderLoading(false);
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

function deleteField(id) {
  var fields = getSavedFields().filter(function (f) { return f.id !== id; });
  localStorage.setItem('ndvi_fields', JSON.stringify(fields));
  if (id === currentFieldId) {
    currentFieldId = null;
    currentFieldName = null;
    currentGeometry = null;
    drawnItems.clearLayers();
    updateDrawEditVisibility();
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
  var plantingDateStr = prompt('Planting date (YYYY-MM-DD), or leave blank if unknown:');
  var plantingDate = null;
  if (plantingDateStr && !isNaN(Date.parse(plantingDateStr))) {
    plantingDate = plantingDateStr;
  }
  saveField(name, geojson, plantingDate);
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
    var plantInfo = f.plantingDate ? 'Planted ' + f.plantingDate : '';
    return (
      '<div class="field-card" data-id="' + f.id + '">' +
        '<div class="field-top">' +
          '<div class="field-name">' + escapeHtml(f.name) + '</div>' +
          '<button class="delete-btn" data-id="' + f.id + '">\u2715</button>' +
        '</div>' +
        '<div class="field-meta">' +
          '<span class="field-area">\ud83d\udccd ' + formatHectares(getOrComputeArea(f)) + '</span>' +
          (plantInfo ? '<span>' + plantInfo + '</span>' : '') +
          '<button class="plant-date-btn" data-id="' + f.id + '" title="Set planting date">\u270f\ufe0f date</button>' +
        '</div>' +
        '<div class="field-status" id="status-' + f.id + '">Loading\u2026</div>' +
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

  container.querySelectorAll('.plant-date-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var fields = getSavedFields();
      var field = fields.find(function (f) { return f.id === btn.dataset.id; });
      if (!field) return;
      var hint = field.plantingDate ? 'Current: ' + field.plantingDate : 'No planting date set';
      var str = prompt('Planting date (YYYY-MM-DD), or leave blank to clear:\n' + hint);
      if (str && !isNaN(Date.parse(str))) {
        field.plantingDate = str;
      } else if (str === '' || str === null) {
        field.plantingDate = null;
      } else {
        return;
      }
      localStorage.setItem('ndvi_fields', JSON.stringify(fields));
      renderFieldList();
    });
  });
}

function badgeHtml(cssClass, text) {
  return '<span class="badge ' + cssClass + '">' + text + '</span>';
}

function buildStatusText(field, value, index) {
  index = index || 'ndvi';
  if (index !== 'ndvi') {
    if (index === 'ndwi') {
      var wlabel = value > 0.3 ? 'Water' : value > 0 ? 'Moist' : 'Dry';
      var wclass = value > 0.3 ? 'blue' : value > 0 ? 'orange' : 'yellow';
      return badgeHtml(wclass, wlabel) + ' (' + value.toFixed(2) + ')';
    }
    return '';
  }
  if (!field.plantingDate) {
    var cls, lbl;
    if (value > 0.6) { cls = 'green'; lbl = 'Healthy'; }
    else if (value > 0.3) { cls = 'yellow'; lbl = 'Moderate'; }
    else { cls = 'red'; lbl = 'Stressed'; }
    return badgeHtml(cls, lbl) + ' NDVI ' + value.toFixed(2);
  }
  var daysSincePlanting = Math.floor((Date.now() - new Date(field.plantingDate).getTime()) / 86400000);
  if (daysSincePlanting < 0) return badgeHtml('yellow', 'Check date') + ' Planting date is in the future';
  var stage = getGrowthStage(daysSincePlanting);
  var cls2, lbl2;
  if (value >= stage.min && value <= stage.max) {
    cls2 = 'green'; lbl2 = 'Healthy';
  } else if (value < stage.min) {
    var deficit = stage.min - value;
    if (deficit > 0.15) { cls2 = 'red'; lbl2 = 'Stressed'; }
    else { cls2 = 'yellow'; lbl2 = 'Below expected'; }
  } else {
    cls2 = 'green'; lbl2 = 'Healthy';
  }
  return badgeHtml(cls2, lbl2) + ' ' + stage.stage + ' \u00b7 Day ' + daysSincePlanting + ' \u00b7 NDVI ' + value.toFixed(2);
}

function updateFieldStatus(field) {
  var geom = field.geojson && (field.geojson.geometry || field.geojson);
  if (!geom || !geom.coordinates) return;
  var coords = geom.coordinates;
  var geometry = ee.Geometry.Polygon(coords);

  var cfg = INDICES[currentIndex];
  var recent = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(geometry)
    .filterDate(ee.Date(Date.now()).advance(-1, 'month'), ee.Date(Date.now()))
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .median()
    .normalizedDifference(cfg.bands)
    .rename(cfg.name);

  var meanVal = recent.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geometry,
    scale: 10,
    maxPixels: 1e9,
  });

  meanVal.evaluate(function (result) {
    var el = document.getElementById('status-' + field.id);
    if (!el) return;
    var value = result && result[cfg.name];
    if (value == null || value === undefined) {
      el.textContent = 'No recent data';
      return;
    }
    el.innerHTML = buildStatusText(field, value, currentIndex);
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
  var location = currentFieldName || document.getElementById('point-coords').textContent;
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

function setStatus(state, text) {
  var bar = document.getElementById('status-bar');
  bar.textContent = text;
  bar.className = 'status-bar ' + state;
}
