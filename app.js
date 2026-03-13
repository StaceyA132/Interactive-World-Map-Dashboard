// Leaflet dashboard with live USGS earthquakes + real flights/weather via local API proxy
const ENDPOINTS = {
  earthquakes: '/api/earthquakes',
  flights: '/api/flights',
  weather: '/api/weather',
};

const state = {
  earthquakes: [],
  flights: [],
  weather: [],
  lastFetched: null,
  timelineDays: 1, // default: last 24h
};

// Map setup
const lightTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap, &copy; CARTO',
});
const darkTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap, &copy; CARTO',
});

const map = L.map('map', {
  worldCopyJump: true,
  layers: [lightTiles],
  zoomControl: false,
}).setView([20, 0], 2);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomleft' }).addTo(map);

const TIMELINE_MIN = 0;
const TIMELINE_MAX = 7;
const TIMELINE_INTERVAL_MS = 4000;

const TIMELINE_MIN = 0;
const TIMELINE_MAX = 7;
const TIMELINE_INTERVAL_MS = 4000;

// Layer groups
const earthquakeLayer = L.layerGroup().addTo(map);
const earthquakeClusters = L.markerClusterGroup({
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
});
const quakeHeat = L.heatLayer([], { radius: 18, blur: 22, maxZoom: 6, minOpacity: 0.35 });
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

function updateStatus(text) {
  document.getElementById('status').textContent = text;
}

function updateLastUpdated() {
  const el = document.getElementById('last-updated');
  if (!el) return;
  const ts = state.lastFetched ? state.lastFetched.toLocaleTimeString() : '—';
  el.textContent = `Updated: ${ts}`;
}

function updateStats({ quakes24 = 0, strong = 0, flights = 0 }) {
  document.getElementById('stat-quakes').textContent = quakes24;
  document.getElementById('stat-strong').textContent = strong;
  document.getElementById('stat-flights').textContent = flights;
}

function recalcStats() {
  const now = Date.now();
  const quakes24 = state.earthquakes.filter((q) => q.properties.time >= now - 24 * 60 * 60 * 1000).length;
  const strong = state.earthquakes.filter((q) => q.properties.mag >= 5).length;
  updateStats({ quakes24, strong, flights: state.flights.length });
}

// Earthquake rendering
function renderEarthquakes() {
  earthquakeLayer.clearLayers();
  earthquakeClusters.clearLayers();
  quakeHeat.setLatLngs([]);
  const now = Date.now();
  const cutoff = now - state.timelineDays * 24 * 60 * 60 * 1000;

  const filtered = state.earthquakes.filter((q) => q.properties.time >= cutoff);

  filtered.forEach((feat) => {
    const { mag, place, time, url } = feat.properties;
    const [lon, lat, depth] = feat.geometry.coordinates;
    const marker = L.circleMarker([lat, lon], {
      radius: Math.max(4, mag * 1.8),
      color: colorForMag(mag),
      weight: 1,
      fillOpacity: 0.75,
    }).bindPopup(`
      <strong>${place}</strong><br/>
      Mag ${mag?.toFixed(1) ?? 'n/a'} • Depth ${depth?.toFixed(0) ?? '?'} km<br/>
      ${formatDate(time)}<br/>
      <a href="${url}" target="_blank" rel="noreferrer">USGS detail</a>
    `);
    earthquakeLayer.addLayer(marker);
    earthquakeClusters.addLayer(marker);
    quakeHeat.addLatLng([lat, lon, Math.max(0.5, mag || 1)]);
  });

  recalcStats();
  updateStatus(`Showing ${filtered.length} quakes (past ${state.timelineDays === 1 ? '24h' : `${state.timelineDays} days`})`);
  updateLayerPill();
}

async function loadEarthquakes() {
  updateStatus('Fetching earthquakes…');
  try {
    const res = await fetch(ENDPOINTS.earthquakes);
    const json = await res.json();
    state.earthquakes = json.features || [];
    state.lastFetched = new Date();
    renderEarthquakes();
    updateLastUpdated();
  } catch (err) {
    console.error(err);
    updateStatus('Failed to load earthquakes');
  }
}

function renderFlights() {
  flightLayer.clearLayers();
  state.flights.forEach((f) => {
    const marker = L.marker([f.lat, f.lon], {
      title: f.id,
      icon: L.divIcon({
        className: 'flight-icon',
        html: '✈️',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).bindPopup(`<strong>${f.id}</strong><br/>Altitude ${f.alt?.toFixed ? f.alt.toFixed(0) : f.alt || 'n/a'} m<br/>${f.country || ''}`);
    flightLayer.addLayer(marker);
  });
}

function weatherIcon(code) {
  if (typeof code === 'string') return code; // already an icon/word
  const map = {
    0: '☀️',
    1: '🌤️',
    2: '⛅️',
    3: '☁️',
    45: '🌫️',
    48: '🌫️',
    51: '🌦️',
    61: '🌧️',
    71: '🌨️',
    80: '🌧️',
    95: '⛈️',
  };
  return map[code] || 'ℹ️';
}

function renderWeather() {
  weatherLayer.clearLayers();
  state.weather.forEach((w) => {
    const marker = L.marker([w.lat, w.lon], {
      icon: L.divIcon({ className: 'weather-icon', html: weatherIcon(w.icon), iconSize: [26, 26], iconAnchor: [13, 13] }),
    }).bindPopup(`<strong>${w.city}</strong><br/>${w.temp ?? '–'}°C`);
    weatherLayer.addLayer(marker);
  });
}

async function loadFlights() {
  try {
    const res = await fetch(ENDPOINTS.flights);
    const json = await res.json();
    state.flights = json.flights || [];
    renderFlights();
    recalcStats();
  } catch (err) {
    console.error(err);
    updateStatus('Failed to load flights');
  }
}

async function loadWeather() {
  try {
    const res = await fetch(ENDPOINTS.weather);
    const json = await res.json();
    state.weather = json.weather || [];
    renderWeather();
  } catch (err) {
    console.error(err);
    updateStatus('Failed to load weather');
  }
}

// UI wiring
function bindControls() {
  const timeline = document.getElementById('timeline');
  const timelineLabel = document.getElementById('timeline-label');

  document.getElementById('layer-earthquakes').addEventListener('change', (e) => {
    if (e.target.checked) earthquakeLayer.addTo(map);
    else map.removeLayer(earthquakeLayer);
    updateLayerPill();
  });
  document.getElementById('layer-quake-clusters').addEventListener('change', (e) => {
    if (e.target.checked) earthquakeClusters.addTo(map);
    else map.removeLayer(earthquakeClusters);
    updateLayerPill();
  });
  document.getElementById('layer-quake-heat').addEventListener('change', (e) => {
    if (e.target.checked) quakeHeat.addTo(map);
    else map.removeLayer(quakeHeat);
    updateLayerPill();
  });
  document.getElementById('layer-flights').addEventListener('change', (e) => {
    if (e.target.checked) flightLayer.addTo(map);
    else map.removeLayer(flightLayer);
    updateLayerPill();
  });
  document.getElementById('layer-weather').addEventListener('change', (e) => {
    if (e.target.checked) weatherLayer.addTo(map);
    else map.removeLayer(weatherLayer);
    updateLayerPill();
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadEarthquakes();
    loadFlights();
    loadWeather();
  });

  function applyTimeline(val) {
    const days = Number(val) || 0;
    state.timelineDays = Math.max(1, days === 0 ? 0.25 : days); // 0 -> 6h snapshot
    const label = days === 0 ? 'Last 6 hours (live)' : `Past ${days} day${days > 1 ? 's' : ''}`;
    timelineLabel.textContent = label;
    renderEarthquakes();
    const pct = Math.round(((days - TIMELINE_MIN) / (TIMELINE_MAX - TIMELINE_MIN)) * 100);
    const prog = document.getElementById('timeline-progress-fill');
    if (prog) prog.style.width = `${pct}%`;
  }

  timeline.addEventListener('input', (e) => applyTimeline(e.target.value));

  // Autoplay timeline: step every few seconds and wrap
  setInterval(() => {
    let next = Number(timeline.value) + 1;
    if (next > TIMELINE_MAX) next = TIMELINE_MIN;
    timeline.value = next;
    applyTimeline(next);
  }, TIMELINE_INTERVAL_MS);

  document.getElementById('dark-mode').addEventListener('change', (e) => {
    if (e.target.checked) {
      map.removeLayer(lightTiles);
      darkTiles.addTo(map);
    } else {
      map.removeLayer(darkTiles);
      lightTiles.addTo(map);
    }
  });

  document.getElementById('btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 6, { animate: true });
      },
      (err) => console.warn('geolocation denied', err),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

function updateLayerPill() {
  const pill = document.getElementById('layer-pill');
  if (!pill) return;
  const on = (id) => document.getElementById(id)?.checked;
  const parts = [
    `EQ ${on('layer-earthquakes') ? '●' : '✕'}`,
    `Cluster ${on('layer-quake-clusters') ? '●' : '✕'}`,
    `Heat ${on('layer-quake-heat') ? '●' : '✕'}`,
    `Flights ${on('layer-flights') ? '●' : '✕'}`,
    `Weather ${on('layer-weather') ? '●' : '✕'}`,
  ];
  pill.textContent = `Layers: ${parts.join('  ')}`;
}

function init() {
  bindControls();
  loadEarthquakes();
  loadFlights();
  loadWeather();
}

init();
