import os
import time
from typing import List, Dict, Any, Callable

import requests
from flask import Flask, jsonify, request, send_from_directory

# Only files in public/ are served, so server.py, .git, etc. stay private.
app = Flask(__name__, static_folder="public", static_url_path="")

USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson"
DEFAULT_WEATHER_LOCS = [
    {"city": "Reykjavik", "lat": 64.13, "lon": -21.82},
    {"city": "Anchorage", "lat": 61.22, "lon": -149.90},
    {"city": "Los Angeles", "lat": 34.05, "lon": -118.24},
    {"city": "New York", "lat": 40.71, "lon": -74.01},
    {"city": "Mexico City", "lat": 19.43, "lon": -99.13},
    {"city": "São Paulo", "lat": -23.55, "lon": -46.63},
    {"city": "London", "lat": 51.51, "lon": -0.13},
    {"city": "Lagos", "lat": 6.52, "lon": 3.38},
    {"city": "Cairo", "lat": 30.04, "lon": 31.24},
    {"city": "Nairobi", "lat": -1.29, "lon": 36.82},
    {"city": "Cape Town", "lat": -33.92, "lon": 18.42},
    {"city": "Moscow", "lat": 55.76, "lon": 37.62},
    {"city": "Dubai", "lat": 25.20, "lon": 55.27},
    {"city": "Mumbai", "lat": 19.08, "lon": 72.88},
    {"city": "Singapore", "lat": 1.35, "lon": 103.82},
    {"city": "Beijing", "lat": 39.90, "lon": 116.41},
    {"city": "Tokyo", "lat": 35.68, "lon": 139.65},
    {"city": "Sydney", "lat": -33.87, "lon": 151.21},
]

# Seconds to reuse an upstream response (keeps us under OpenSky's rate limits).
CACHE_TTL = {"earthquakes": 120, "flights": 60, "weather": 600}
_cache: Dict[str, Dict[str, Any]] = {}


def cached(key: str, ttl: int, fetch: Callable[[], Dict[str, Any]]) -> Dict[str, Any]:
    hit = _cache.get(key)
    if hit and time.time() - hit["at"] < ttl:
        return hit["data"]
    data = fetch()
    if not data.get("error"):
        _cache[key] = {"at": time.time(), "data": data}
    return data


def fetch_earthquakes() -> Dict[str, Any]:
    r = requests.get(USGS_URL, timeout=10)
    r.raise_for_status()
    return r.json()


def fetch_flights(bbox: str = "") -> Dict[str, Any]:
    user = os.getenv("OPENSKY_USER")
    password = os.getenv("OPENSKY_PASS")
    params = {}
    if bbox:
        parts = bbox.split(",")
        if len(parts) == 4:
            params = {
                "lamin": parts[0],
                "lomin": parts[1],
                "lamax": parts[2],
                "lomax": parts[3],
            }

    auth = (user, password) if user and password else None
    try:
        resp = requests.get("https://opensky-network.org/api/states/all", params=params, auth=auth, timeout=10)
        resp.raise_for_status()
    except Exception as exc:  # pragma: no cover - simple surface error
        return {"flights": [], "error": str(exc), "requiresAuth": not bool(auth)}

    states = resp.json().get("states") or []
    flights: List[Dict[str, Any]] = []
    for s in states[:120]:
        if not s or len(s) < 17:
            continue
        lon, lat = s[5], s[6]
        if lon is None or lat is None:
            continue
        flights.append(
            {
                "id": (s[1] or s[0] or "N/A").strip(),
                "lat": lat,
                "lon": lon,
                "alt": s[13],  # geo altitude
                "velocity": s[9],
                "heading": s[10],
                "country": s[2],
            }
        )
    return {"flights": flights, "source": "opensky", "requiresAuth": not bool(auth)}


def wmo_condition(code: Any) -> str:
    """Map an Open-Meteo WMO weather code to a shared condition name."""
    if code is None:
        return "unknown"
    if code == 0:
        return "clear"
    if code in (1, 2):
        return "partly"
    if code == 3:
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if 51 <= code <= 57:
        return "drizzle"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    if code >= 95:
        return "storm"
    return "unknown"


def owm_condition(code: Any) -> str:
    """Map an OpenWeather condition id to the same condition names."""
    if not isinstance(code, int):
        return "unknown"
    if code == 800:
        return "clear"
    if code in (801, 802):
        return "partly"
    if code in (803, 804):
        return "cloudy"
    return {2: "storm", 3: "drizzle", 5: "rain", 6: "snow", 7: "fog"}.get(code // 100, "unknown")


def fetch_openweather(key: str) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for loc in DEFAULT_WEATHER_LOCS:
        try:
            # One failing city shouldn't take down the whole layer.
            params = {"lat": loc["lat"], "lon": loc["lon"], "appid": key, "units": "metric"}
            resp = requests.get("https://api.openweathermap.org/data/2.5/weather", params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            results.append({
                **loc,
                "temp": data.get("main", {}).get("temp"),
                "condition": owm_condition(data.get("weather", [{}])[0].get("id")),
            })
        except Exception as exc:  # pragma: no cover
            app.logger.warning("Weather fetch failed for %s: %s", loc["city"], exc)
    return results


def fetch_open_meteo() -> List[Dict[str, Any]]:
    # Open-Meteo accepts comma-separated coordinates and returns one entry per location.
    params = {
        "latitude": ",".join(str(loc["lat"]) for loc in DEFAULT_WEATHER_LOCS),
        "longitude": ",".join(str(loc["lon"]) for loc in DEFAULT_WEATHER_LOCS),
        "current_weather": True,
    }
    resp = requests.get("https://api.open-meteo.com/v1/forecast", params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    entries = data if isinstance(data, list) else [data]
    results: List[Dict[str, Any]] = []
    for loc, entry in zip(DEFAULT_WEATHER_LOCS, entries):
        current = entry.get("current_weather", {})
        results.append({
            **loc,
            "temp": current.get("temperature"),
            "condition": wmo_condition(current.get("weathercode")),
        })
    return results


def fetch_weather() -> Dict[str, Any]:
    key = os.getenv("OPENWEATHER_API_KEY", "")
    try:
        results = fetch_openweather(key) if key else fetch_open_meteo()
    except Exception as exc:  # pragma: no cover
        app.logger.warning("Weather fetch failed: %s", exc)
        results = []
    out: Dict[str, Any] = {"weather": results, "provider": "openweather" if key else "open-meteo"}
    if not results:
        out["error"] = "All weather lookups failed"
    return out


@app.route("/")
def root():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/earthquakes")
def api_earthquakes():
    try:
        return jsonify(cached("earthquakes", CACHE_TTL["earthquakes"], fetch_earthquakes))
    except Exception as exc:
        return jsonify({"features": [], "error": str(exc)}), 502


@app.route("/api/flights")
def api_flights():
    bbox = request.args.get("bbox", "")
    data = cached(f"flights:{bbox}", CACHE_TTL["flights"], lambda: fetch_flights(bbox))
    return jsonify(data), (502 if data.get("error") else 200)


@app.route("/api/weather")
def api_weather():
    data = cached("weather", CACHE_TTL["weather"], fetch_weather)
    return jsonify(data), (502 if data.get("error") else 200)


if __name__ == "__main__":
    # Localhost + no debugger by default; the Werkzeug debugger allows remote code execution.
    # Set HOST=0.0.0.0 to reach it from other devices, FLASK_DEBUG=1 for auto-reload.
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 5000))
    app.run(host=host, port=port, debug=os.getenv("FLASK_DEBUG") == "1")
