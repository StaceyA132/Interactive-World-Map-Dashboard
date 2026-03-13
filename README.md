# Interactive World Map Dashboard

Leaflet-first dashboard that visualizes global signals on a world map. Includes live USGS earthquakes plus placeholder layers for flights, weather, and transit so you can swap in your own APIs.

## Quick start
1) Serve statically from the project root:
   - `python -m http.server 8000`
2) Open `http://localhost:8000` in a browser (network required for tiles + USGS feed).
3) Use the left controls to toggle layers and adjust the timeline slider.

## Files
- `index.html` — layout and UI controls.
- `styles.css` — dark, glassy theme with responsive grid.
- `app.js` — Leaflet map, live USGS earthquake fetch, sample flight/weather/transit layers, layer toggles, timeline filtering, dark basemap switch.

## Replacing sample data
- **Flights**: connect to OpenSky or ADS-B JSON and map to `{ id, lat, lon, alt }`.
- **Weather**: hook Open-Meteo/OpenWeather and map to `{ city, lat, lon, temp, icon }`.
- **Transit**: ingest GTFS-rt positions/status and map to `{ name, lat, lon, status }`.

## Roadmap ideas
- Cluster or heatmap for dense quake regions.
- Persist layer/timeline selections in `localStorage`.
- Add SwiftUI shell using `WKWebView` or native `MapKit` reading the same JSON.
