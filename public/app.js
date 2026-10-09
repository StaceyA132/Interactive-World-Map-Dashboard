// Leaflet dashboard with live USGS earthquakes + real flights/weather via local API proxy
const ENDPOINTS = {
  earthquakes: '/api/earthquakes',
  flights: '/api/flights',
  weather: '/api/weather',
};

const HOUR_MS = 60 * 60 * 1000;
const AUTO_REFRESH_MS = 5 * 60 * 1000;

const state = {
  earthquakes: [],
  flights: [],
  weather: [],
  lastFetched: null,
  timelineHours: 24, // default: last 24h
  quakeMode: 'markers', // markers | clusters | heat
  errors: {}, // source -> message, shown in the status pill
};

// Map setup
// Esri Canvas basemaps (keyless; CARTO's free tiles now require an API key)
const ESRI_CANVAS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/{style}/MapServer/tile/{z}/{y}/{x}';
const tileOptions = {
  maxZoom: 16,
  attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
};
const lightTiles = L.tileLayer(ESRI_CANVAS, { ...tileOptions, style: 'World_Light_Gray_Base' });
const darkTiles = L.tileLayer(ESRI_CANVAS, { ...tileOptions, style: 'World_Dark_Gray_Base' });

const map = L.map('map', {
  worldCopyJump: true,
  layers: [darkTiles],
  zoomControl: false,
}).setView([20, 0], 2);
L.control.zoom({ position: 'bottomright' }).addTo(map);

const TIMELINE_MIN = 0;
const TIMELINE_MAX = 7;
// Timeline autoplay speed (milliseconds per step)
const TIMELINE_INTERVAL_MS = 2000;

// Layer groups. Markers and clusters each get their own marker instances,
// since a Leaflet layer can only belong to one visible group at a time.
const quakeMarkers = L.layerGroup();
const quakeClusters = L.markerClusterGroup({
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  // Size by count, color by the strongest quake inside (matches the legend)
  iconCreateFunction(cluster) {
    const count = cluster.getChildCount();
    const maxMag = Math.max(...cluster.getAllChildMarkers().map((m) => m.options.mag || 0));
    const size = count < 10 ? 30 : count < 100 ? 38 : 46;
    return L.divIcon({
      html: `<span style="--c:${colorForMag(maxMag)}">${count}</span>`,
      className: 'quake-cluster',
      iconSize: [size, size],
    });
  },
});
const quakeHeat = L.heatLayer([], {
  radius: 18,
  blur: 22,
  maxZoom: 6,
  minOpacity: 0.35,
  gradient: { 0.3: '#6ee7b7', 0.6: '#fbbf24', 0.85: '#f87171', 1: '#fecaca' },
});
const quakeLayers = { markers: quakeMarkers, clusters: quakeClusters, heat: quakeHeat };
const earthquakeLayer = L.layerGroup([quakeMarkers]).addTo(map);
const flightLayer = L.layerGroup().addTo(map);
const weatherLayer = L.layerGroup().addTo(map);

// Helpers
function colorForMag(mag) {
  if (mag >= 5) return '#f87171';
  if (mag >= 4) return '#fbbf24';
  return '#6ee7b7';
}

function formatDate(ts) {
  return new Date(ts).toUTCString();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function timeAgo(date) {
  const mins = Math.round((Date.now() - date) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function updateLastUpdated() {
  if (state.lastFetched) document.getElementById('last-updated').textContent = `Updated ${timeAgo(state.lastFetched)}`;
}

function periodLabel(hours) {
  if (hours < 24) return `${hours}h`;
  if (hours === 24) return '24h';
  return `${hours / 24} days`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function setError(source, message) {
  if (message) state.errors[source] = message;
  else delete state.errors[source];
  updateStatus();
}

function filteredQuakes() {
  const cutoff = Date.now() - state.timelineHours * HOUR_MS;
  return state.earthquakes.filter((q) => q.properties.time >= cutoff);
}

function updateStatus() {
  const parts = [state.lastFetched
    ? `Showing ${filteredQuakes().length} quakes (past ${periodLabel(state.timelineHours)})`
    : 'Loading earthquakes…'];
  Object.values(state.errors).forEach((msg) => parts.push(msg));
  document.getElementById('status').textContent = parts.join(' · ');
}

function recalcStats() {
  const quakes = filteredQuakes();
  document.getElementById('stat-quakes-label').textContent = `Earthquakes (${periodLabel(state.timelineHours)})`;
  document.getElementById('stat-quakes').textContent = quakes.length;
  document.getElementById('stat-strong').textContent = quakes.filter((q) => q.properties.mag >= 5).length;
  document.getElementById('stat-flights').textContent = state.errors.flights ? '–' : state.flights.length;
}

// Earthquake rendering
function quakeMarker(feat) {
  const { mag, place, time, url } = feat.properties;
  const [lon, lat, depth] = feat.geometry.coordinates;
  return L.circleMarker([lat, lon], {
    radius: Math.max(4, mag * 1.8),
    color: colorForMag(mag),
    mag,
    weight: 1,
    fillOpacity: 0.75,
  }).bindPopup(`
    <strong>${escapeHtml(place)}</strong><br/>
    Mag ${mag?.toFixed(1) ?? 'n/a'} • Depth ${depth?.toFixed(0) ?? '?'} km<br/>
    ${formatDate(time)}<br/>
    <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">USGS detail</a>
  `);
}

function renderEarthquakes() {
  const filtered = filteredQuakes();

  quakeMarkers.clearLayers();
  quakeClusters.clearLayers();
  filtered.forEach((feat) => quakeMarkers.addLayer(quakeMarker(feat)));
  quakeClusters.addLayers(filtered.map(quakeMarker));
  quakeHeat.setLatLngs(filtered.map((feat) => {
    const [lon, lat] = feat.geometry.coordinates;
    return [lat, lon, Math.max(0.5, feat.properties.mag || 1)];
  }));

  recalcStats();
  updateStatus();
}

function setQuakeMode(mode) {
  earthquakeLayer.removeLayer(quakeLayers[state.quakeMode]);
  state.quakeMode = mode;
  earthquakeLayer.addLayer(quakeLayers[mode]);
}

async function loadEarthquakes() {
  try {
    const json = await fetchJson(ENDPOINTS.earthquakes);
    state.earthquakes = json.features || [];
    state.lastFetched = new Date();
    setError('earthquakes', null);
    renderEarthquakes();
    updateLastUpdated();
  } catch (err) {
    console.error(err);
    setError('earthquakes', 'Earthquakes unavailable');
  }
}

// Material "flight" glyph, pointing north so it can be rotated by heading
const PLANE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';

function renderFlights() {
  flightLayer.clearLayers();
  state.flights.forEach((f) => {
    const altFt = typeof f.alt === 'number' ? `${Math.round(f.alt * 3.28084).toLocaleString()} ft` : 'n/a';
    const speedKt = typeof f.velocity === 'number' ? `${Math.round(f.velocity * 1.94384)} kt` : 'n/a';
    const marker = L.marker([f.lat, f.lon], {
      title: f.id,
      icon: L.divIcon({
        className: 'flight-icon',
        html: `<span style="transform: rotate(${Number(f.heading) || 0}deg)">${PLANE_SVG}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).bindPopup(`
      <strong>${escapeHtml(f.id)}</strong><br/>
      ${altFt} • ${speedKt}<br/>
      ${escapeHtml(f.country)}
    `);
    flightLayer.addLayer(marker);
  });
}

const WEATHER_ICONS = {
  clear: ['☀️', 'Clear'],
  partly: ['⛅️', 'Partly cloudy'],
  cloudy: ['☁️', 'Cloudy'],
  fog: ['🌫️', 'Fog'],
  drizzle: ['🌦️', 'Drizzle'],
  rain: ['🌧️', 'Rain'],
  snow: ['🌨️', 'Snow'],
  storm: ['⛈️', 'Thunderstorm'],
  unknown: ['🌡️', 'Unknown'],
};

function renderWeather() {
  weatherLayer.clearLayers();
  state.weather.forEach((w) => {
    const [icon, label] = WEATHER_ICONS[w.condition] || WEATHER_ICONS.unknown;
    const temp = typeof w.temp === 'number' ? `${Math.round(w.temp)}°` : '–';
    const marker = L.marker([w.lat, w.lon], {
      icon: L.divIcon({
        className: 'weather-badge',
        html: `<span>${icon}</span><b>${temp}</b>`,
        iconSize: [62, 28],
        iconAnchor: [31, 14],
      }),
    }).bindPopup(`<strong>${escapeHtml(w.city)}</strong><br/>${label} • ${temp}C`);
    weatherLayer.addLayer(marker);
  });
}

async function loadFlights() {
  try {
    const json = await fetchJson(ENDPOINTS.flights);
    state.flights = json.flights || [];
    setError('flights', null);
  } catch (err) {
    console.error(err);
    state.flights = [];
    setError('flights', 'Flights unavailable (OpenSky limit?)');
  }
  renderFlights();
  recalcStats();
}

async function loadWeather() {
  try {
    const json = await fetchJson(ENDPOINTS.weather);
    state.weather = json.weather || [];
    setError('weather', null);
    renderWeather();
  } catch (err) {
    console.error(err);
    setError('weather', 'Weather unavailable');
  }
}

// UI wiring
function bindControls() {
  const timeline = document.getElementById('timeline');
  const timelineLabel = document.getElementById('timeline-label');
  const timelineToggle = document.getElementById('timeline-toggle');
  let timelineLoop = null;

  const toggleLayer = (id, layer) => {
    document.getElementById(id).addEventListener('change', (e) => {
      if (e.target.checked) layer.addTo(map);
      else map.removeLayer(layer);
    });
  };
  toggleLayer('layer-earthquakes', earthquakeLayer);
  toggleLayer('layer-flights', flightLayer);
  toggleLayer('layer-weather', weatherLayer);

  document.querySelectorAll('input[name="quake-mode"]').forEach((input) => {
    input.addEventListener('change', (e) => setQuakeMode(e.target.value));
  });

  document.getElementById('btn-refresh').addEventListener('click', refreshAll);

  function applyTimeline(val) {
    const days = Number(val) || 0;
    state.timelineHours = days === 0 ? 6 : days * 24; // 0 -> 6h snapshot
    const label = days === 0 ? 'Last 6 hours (live)' : `Past ${days} day${days > 1 ? 's' : ''}`;
    timelineLabel.textContent = label;
    renderEarthquakes();
  }

  timeline.addEventListener('input', (e) => applyTimeline(e.target.value));

  function stepTimeline() {
    let next = Number(timeline.value) + 1;
    if (next > TIMELINE_MAX) next = TIMELINE_MIN;
    timeline.value = next;
    applyTimeline(next);
  }

  function startTimelineAutoplay() {
    if (timelineLoop) clearInterval(timelineLoop);
    timelineLoop = setInterval(stepTimeline, TIMELINE_INTERVAL_MS);
    timelineToggle.textContent = '⏸';
    timelineToggle.setAttribute('aria-pressed', 'true');
  }

  function stopTimelineAutoplay() {
    if (timelineLoop) clearInterval(timelineLoop);
    timelineLoop = null;
    timelineToggle.textContent = '▶︎';
    timelineToggle.setAttribute('aria-pressed', 'false');
  }

  timelineToggle.addEventListener('click', () => {
    if (timelineLoop) {
      stopTimelineAutoplay();
    } else {
      startTimelineAutoplay();
    }
  });


  document.getElementById('light-mode').addEventListener('change', (e) => {
    if (e.target.checked) {
      map.removeLayer(darkTiles);
      lightTiles.addTo(map);
    } else {
      map.removeLayer(lightTiles);
      darkTiles.addTo(map);
    }
  });
}

async function refreshAll() {
  const btn = document.getElementById('btn-refresh');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  await Promise.allSettled([loadEarthquakes(), loadFlights(), loadWeather()]);
  btn.disabled = false;
  btn.textContent = 'Refresh';
}

function init() {
  bindControls();
  refreshAll();
  setInterval(refreshAll, AUTO_REFRESH_MS);
  setInterval(updateLastUpdated, 30 * 1000);
}

init();
