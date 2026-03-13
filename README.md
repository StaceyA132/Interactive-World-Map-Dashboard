# Interactive World Map Dashboard

Leaflet-first dashboard that visualizes global signals on a world map. Includes live USGS earthquakes plus real data hookups for flights (OpenSky), weather (Open-Meteo/OpenWeather), and transit (GTFS JSON).

## Quick start
1) Install deps (ideally in a venv): `pip install -r requirements.txt`
2) Export any needed keys:
   - `OPENSKY_USER`, `OPENSKY_PASS` (OpenSky basic auth; optional but recommended)
   - `OPENWEATHER_API_KEY` (if set, uses OpenWeather; otherwise falls back to Open-Meteo)
   - `GTFS_RT_VEHICLES` (optional GTFS-RT VehiclePositions URL, protobuf)
   - `GTFS_JSON_URL` (optional JSON endpoint returning a list of `{name,lat,lon,status}` vehicles)
3) Run the proxy + static server: `python server.py`
4) Open `http://localhost:5000` (needs network for tiles + upstream APIs).
5) Use the left controls to toggle layers and adjust the timeline slider.

## Files
- `index.html` — layout and UI controls.
- `styles.css` — dark, glassy theme with responsive grid.
- `app.js` — Leaflet map, live USGS earthquakes, OpenSky flights, Open-Meteo/OpenWeather current weather, transit via GTFS JSON, layer toggles, timeline filtering, dark basemap switch.
- `server.py` — Flask proxy that handles CORS, secrets, and API calls to USGS, OpenSky, Open-Meteo/OpenWeather, and a GTFS JSON feed.
- `requirements.txt` — minimal Python deps for the proxy.
- `vendor/leaflet/` — locally vendored Leaflet 1.9.4 (JS, CSS, marker icons) for offline/fallback use.

## Configuration notes
- **Flights (OpenSky)**: set `OPENSKY_USER` and `OPENSKY_PASS`. You can pass a `bbox` query param (lamin,lomin,lamax,lomax) if you want the API to filter to a region; otherwise a global slice of results is returned.
- **Weather**: if `OPENWEATHER_API_KEY` is present, the proxy uses OpenWeather (metric units). Otherwise it uses Open-Meteo (no key). Default cities are Reykjavik, New York, and Tokyo; tweak `DEFAULT_WEATHER_LOCS` in `server.py`.
- **Transit (GTFS)**: set one of:
  - `GTFS_RT_VEHICLES`: URL to a GTFS-RT VehiclePositions feed (protobuf). The proxy decodes it and maps route/trip to name.
  - `GTFS_JSON_URL`: URL to a JSON array of vehicles with `lat`/`lon` (or `latitude`/`longitude`) and optional `name`/`route`/`status`.
  If neither is set, a public keyless U.S. feed (BATA, Michigan) is used by default.

## Roadmap ideas
- Cluster or heatmap for dense quake regions.
- Persist layer/timeline selections in `localStorage`.
- Add SwiftUI shell using `WKWebView` or native `MapKit` reading the same JSON.

## CDN note
Leaflet CSS/JS load from unpkg without SRI hashes because unpkg’s digests change occasionally. Chrome will block the files if the `integrity` hash mismatches, so SRI was removed for reliability during local dev.

## Offline assets
Leaflet is now vendored in `vendor/leaflet/` so the dashboard works even without CDN access; index.html loads the local copy first.
