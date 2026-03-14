# Interactive World Map Dashboard

Leaflet-first dashboard that visualizes global signals on a world map. Includes live USGS earthquakes plus real flights (OpenSky) and live weather (Open-Meteo/OpenWeather).

## Quick start
1) Install deps (ideally in a venv): `pip install -r requirements.txt`
2) Export keys if available:
   - `OPENSKY_USER`, `OPENSKY_PASS` (OpenSky basic auth; improves flight coverage/rate limits)
   - `OPENWEATHER_API_KEY` (uses OpenWeather; otherwise falls back to keyless Open-Meteo)
3) Run the proxy + static server: `python server.py` (set `PORT=5500` if you prefer that port)
4) Open `http://localhost:5000` (or your chosen `PORT`).
5) Use the left controls to toggle layers, switch basemap, and adjust or play/pause the timeline.

## Features
- Live USGS earthquakes with marker clustering and optional heatmap.
- Timeline filter with autoplay (play/pause button) covering live 6h to past 7 days.
- Real flights via OpenSky (uses your credentials if set; otherwise anonymous slice).
- Live weather icons via OpenWeather (with key) or Open-Meteo (no key).

## Files
- `index.html` — layout and UI controls.
- `styles.css` — dark, glassy theme with responsive grid.
- `app.js` — Leaflet map, live USGS earthquakes, OpenSky flights, Open-Meteo/OpenWeather current weather, layer toggles (cluster/heat), timeline filtering with autoplay + play/pause, dark basemap switch.
- `server.py` — Flask proxy that handles CORS, secrets, and API calls to USGS, OpenSky, and Open-Meteo/OpenWeather.
- `requirements.txt` — minimal Python deps for the proxy.
- `vendor/leaflet/` — locally vendored Leaflet 1.9.4 (JS, CSS, marker icons) for offline/fallback use.

## Configuration notes
- **Flights (OpenSky)**: set `OPENSKY_USER` and `OPENSKY_PASS`. You can pass a `bbox` query param (lamin,lomin,lamax,lomax) if you want the API to filter to a region; otherwise a global slice of results is returned.
- **Weather**: if `OPENWEATHER_API_KEY` is present, the proxy uses OpenWeather (metric units). Otherwise it uses Open-Meteo (no key). Default cities are Reykjavik, New York, and Tokyo; tweak `DEFAULT_WEATHER_LOCS` in `server.py`.

## Roadmap ideas
- Persist layer/timeline selections in `localStorage`.
- Added SwiftUI shell using `WKWebView` or native `MapKit` reading the same JSON.

## CDN note
Leaflet CSS/JS load from unpkg without SRI hashes because unpkg’s digests change occasionally. Chrome will block the files if the `integrity` hash mismatches, so SRI was removed for reliability during local dev.

## Offline assets
Leaflet is now vendored in `vendor/leaflet/` so the dashboard works even without CDN access; index.html loads the local copy first.
