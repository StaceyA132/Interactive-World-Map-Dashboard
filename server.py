import os
from typing import List, Dict, Any

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson"
DEFAULT_WEATHER_LOCS = [
    {"city": "Reykjavik", "lat": 64.13, "lon": -21.82},
    {"city": "New York", "lat": 40.71, "lon": -74.01},
    {"city": "Tokyo", "lat": 35.68, "lon": 139.65},
]


def fetch_earthquakes() -> Dict[str, Any]:
    r = requests.get(USGS_URL, timeout=10)
    r.raise_for_status()
    return r.json()


def fetch_flights() -> Dict[str, Any]:
    user = os.getenv("OPENSKY_USER")
    password = os.getenv("OPENSKY_PASS")
    bbox = request.args.get("bbox")
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


def fetch_weather() -> Dict[str, Any]:
    key = os.getenv("OPENWEATHER_API_KEY")
    locations = DEFAULT_WEATHER_LOCS
    results: List[Dict[str, Any]] = []
    for loc in locations:
        if key:
            url = "https://api.openweathermap.org/data/2.5/weather"
            params = {"lat": loc["lat"], "lon": loc["lon"], "appid": key, "units": "metric"}
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            results.append(
                {
                    "city": loc["city"],
                    "lat": loc["lat"],
                    "lon": loc["lon"],
                    "temp": data.get("main", {}).get("temp"),
                    "icon": data.get("weather", [{}])[0].get("main", "?")
                }
            )
        else:
            url = "https://api.open-meteo.com/v1/forecast"
            params = {"latitude": loc["lat"], "longitude": loc["lon"], "current_weather": True}
            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json().get("current_weather", {})
            results.append(
                {
                    "city": loc["city"],
                    "lat": loc["lat"],
                    "lon": loc["lon"],
                    "temp": data.get("temperature"),
                    "icon": data.get("weathercode"),
                }
            )
    return {"weather": results, "provider": "openweather" if key else "open-meteo"}


def fetch_transit() -> Dict[str, Any]:
    url = os.getenv("GTFS_JSON_URL")
    if not url:
        return {"transit": [], "note": "Set GTFS_JSON_URL to a vehicle positions endpoint returning JSON list of {name,lat,lon,status}."}
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    # Expect list of vehicles; keep safe defaults
    transit: List[Dict[str, Any]] = []
    for t in data[:100] if isinstance(data, list) else []:
        lat = t.get("lat") or t.get("latitude")
        lon = t.get("lon") or t.get("longitude")
        if lat is None or lon is None:
            continue
        transit.append(
            {
                "name": t.get("name") or t.get("route") or "Vehicle",
                "lat": lat,
                "lon": lon,
                "status": t.get("status") or t.get("trip_status") or "n/a",
            }
        )
    return {"transit": transit, "source": url}


@app.route("/")
def root():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/earthquakes")
def api_earthquakes():
    return jsonify(fetch_earthquakes())


@app.route("/api/flights")
def api_flights():
    return jsonify(fetch_flights())


@app.route("/api/weather")
def api_weather():
    return jsonify(fetch_weather())


@app.route("/api/transit")
def api_transit():
    return jsonify(fetch_transit())


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
