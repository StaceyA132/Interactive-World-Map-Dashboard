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
    {"city": "New York", "lat": 40.71, "lon": -74.01},
    {"city": "Tokyo", "lat": 35.68, "lon": 139.65},
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


def fetch_city_weather(loc: Dict[str, Any], key: str) -> Dict[str, Any]:
    if key:
        url = "https://api.openweathermap.org/data/2.5/weather"
        params = {"lat": loc["lat"], "lon": loc["lon"], "appid": key, "units": "metric"}
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return {
            "temp": data.get("main", {}).get("temp"),
            "icon": data.get("weather", [{}])[0].get("main", "?"),
        }
    url = "https://api.open-meteo.com/v1/forecast"
    params = {"latitude": loc["lat"], "longitude": loc["lon"], "current_weather": True}
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json().get("current_weather", {})
    return {"temp": data.get("temperature"), "icon": data.get("weathercode")}


def fetch_weather() -> Dict[str, Any]:
    key = os.getenv("OPENWEATHER_API_KEY", "")
    results: List[Dict[str, Any]] = []
    for loc in DEFAULT_WEATHER_LOCS:
        try:
            # One failing city shouldn't take down the whole layer.
            results.append({**loc, **fetch_city_weather(loc, key)})
        except Exception as exc:  # pragma: no cover
            app.logger.warning("Weather fetch failed for %s: %s", loc["city"], exc)
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
