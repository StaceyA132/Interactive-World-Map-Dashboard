// Basic Leaflet dashboard with live USGS earthquakes + sample layers
const ENDPOINTS = {
  earthquakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
};

const state = {
  earthquakes: [],
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

// Layer groups
const earthquakeLayer = L.layerGroup().addTo(map);
const flightLayer = L.layerGroup().addTo(map);
const weatherLayer = L.layerGroup().addTo(map);
const transitLayer = L.layerGroup().addTo(map);

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

function updateStats({ quakes24 = 0, strong = 0, flights = 0, transit = 0 }) {
  document.getElementById('stat-quakes').textContent = quakes24;
  document.getElementById('stat-strong').textContent = strong;
  document.getElementById('stat-flights').textContent = flights;
  document.getElementById('stat-transit').textContent = transit;
}

// Earthquake rendering
function renderEarthquakes() {
  earthquakeLayer.clearLayers();
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
  });

  const strong = filtered.filter((q) => q.properties.mag >= 5).length;
  const quakes24 = state.earthquakes.filter((q) => q.properties.time >= now - 24 * 60 * 60 * 1000).length;
  updateStats({ quakes24, strong, flights: sampleFlights.length, transit: sampleTransit.length });
  updateStatus(`Showing ${filtered.length} quakes (past ${state.timelineDays === 1 ? '24h' : `${state.timelineDays} days`})`);
}

async function loadEarthquakes() {
  updateStatus('Fetching earthquakes…');
  try {
    const res = await fetch(ENDPOINTS.earthquakes);
    const json = await res.json();
    state.earthquakes = json.features || [];
    state.lastFetched = new Date();
    renderEarthquakes();
  } catch (err) {
    console.error(err);
    updateStatus('Failed to load earthquakes');
  }
}

// Sample layers (placeholder data to wire UI)
const sampleFlights = [
  { id: 'UA-15', lat: 37.77, lon: -122.4, alt: 11000 },
  { id: 'DL-88', lat: 51.47, lon: -0.45, alt: 9000 },
  { id: 'AF-319', lat: 48.85, lon: 2.35, alt: 10500 },
];
const sampleWeather = [
  { city: 'Reykjavik', lat: 64.13, lon: -21.82, temp: 4, icon: '🌧️' },
  { city: 'Nairobi', lat: -1.29, lon: 36.82, temp: 23, icon: '⛅️' },
  { city: 'Tokyo', lat: 35.68, lon: 139.65, temp: 18, icon: '☀️' },
];
const sampleTransit = [
  { name: 'SF Muni L', lat: 37.755, lon: -122.47, status: 'On time' },
  { name: 'London Tube', lat: 51.503, lon: -0.112, status: 'Minor delays' },
  { name: 'Tokyo Metro', lat: 35.689, lon: 139.75, status: 'On time' },
];

function renderFlights() {
  flightLayer.clearLayers();
  sampleFlights.forEach((f) => {
    const marker = L.marker([f.lat, f.lon], {
      title: f.id,
      icon: L.divIcon({
        className: 'flight-icon',
        html: '✈️',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).bindPopup(`<strong>${f.id}</strong><br/>Altitude ${f.alt} m`);
    flightLayer.addLayer(marker);
  });
}

function renderWeather() {
  weatherLayer.clearLayers();
  sampleWeather.forEach((w) => {
    const marker = L.marker([w.lat, w.lon], {
      icon: L.divIcon({ className: 'weather-icon', html: w.icon, iconSize: [26, 26], iconAnchor: [13, 13] }),
    }).bindPopup(`<strong>${w.city}</strong><br/>${w.temp}°C`);
    weatherLayer.addLayer(marker);
  });
}

function renderTransit() {
  transitLayer.clearLayers();
  sampleTransit.forEach((t) => {
    const marker = L.circleMarker([t.lat, t.lon], {
      radius: 6,
      color: '#60a5fa',
      weight: 1,
      fillOpacity: 0.7,
    }).bindPopup(`<strong>${t.name}</strong><br/>${t.status}`);
    transitLayer.addLayer(marker);
  });
}

// UI wiring
function bindControls() {
  document.getElementById('layer-earthquakes').addEventListener('change', (e) => {
    if (e.target.checked) earthquakeLayer.addTo(map);
    else map.removeLayer(earthquakeLayer);
  });
  document.getElementById('layer-flights').addEventListener('change', (e) => {
    if (e.target.checked) flightLayer.addTo(map);
    else map.removeLayer(flightLayer);
  });
  document.getElementById('layer-weather').addEventListener('change', (e) => {
    if (e.target.checked) weatherLayer.addTo(map);
    else map.removeLayer(weatherLayer);
  });
  document.getElementById('layer-transit').addEventListener('change', (e) => {
    if (e.target.checked) transitLayer.addTo(map);
    else map.removeLayer(transitLayer);
  });

  document.getElementById('btn-refresh').addEventListener('click', loadEarthquakes);

  const timeline = document.getElementById('timeline');
  const timelineLabel = document.getElementById('timeline-label');
  timeline.addEventListener('input', (e) => {
    const days = Number(e.target.value) || 0;
    state.timelineDays = Math.max(1, days === 0 ? 0.25 : days); // 0 -> 6h snapshot
    const label = days === 0 ? 'Last 6 hours (live)' : `Past ${days} day${days > 1 ? 's' : ''}`;
    timelineLabel.textContent = label;
    renderEarthquakes();
  });

  document.getElementById('dark-mode').addEventListener('change', (e) => {
    if (e.target.checked) {
      map.removeLayer(lightTiles);
      darkTiles.addTo(map);
    } else {
      map.removeLayer(darkTiles);
      lightTiles.addTo(map);
    }
  });
}

function init() {
  renderFlights();
  renderWeather();
  renderTransit();
  bindControls();
  loadEarthquakes();
}

init();
