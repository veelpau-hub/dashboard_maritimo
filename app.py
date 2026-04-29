from flask import Flask, render_template, jsonify, request
import requests
import time
import urllib3
import sqlite3
import json
import os
import math
import logging
from dotenv import load_dotenv
load_dotenv()
urllib3.disable_warnings()

AEMET_API_KEY = os.getenv('AEMET_API_KEY', '')
AISHUB_USER = os.getenv('AISHUB_USER', '')


COASTAL_POINTS = [
    {"name": "Rota",              "lat": 36.637, "lon": -6.362},
    {"name": "Huelva",            "lat": 37.110, "lon": -7.048},
    {"name": "Sanlúcar",          "lat": 36.774, "lon": -6.356},
    {"name": "Tarifa",            "lat": 36.014, "lon": -5.607},
    {"name": "Algeciras",         "lat": 36.127, "lon": -5.456},
    {"name": "Marbella",          "lat": 36.510, "lon": -4.887},
    {"name": "Málaga",            "lat": 36.721, "lon": -4.421},
    {"name": "Motril",            "lat": 36.740, "lon": -3.518},
    {"name": "Almería",           "lat": 36.834, "lon": -2.464},
    {"name": "Cartagena",         "lat": 37.606, "lon": -0.992},
    {"name": "Torrevieja",        "lat": 37.978, "lon": -0.692},
    {"name": "Alicante",          "lat": 38.345, "lon": -0.481},
    {"name": "Benidorm",          "lat": 38.540, "lon": -0.133},
    {"name": "Valencia",          "lat": 39.469, "lon": -0.324},
    {"name": "Gandía",            "lat": 38.985, "lon": -0.164},
    {"name": "Castellón",         "lat": 39.986, "lon":  0.024},
    {"name": "Tarragona",         "lat": 41.117, "lon":  1.249},
    {"name": "Sitges",            "lat": 41.236, "lon":  1.812},
    {"name": "Barcelona",         "lat": 41.383, "lon":  2.177},
    {"name": "Mataró",            "lat": 41.540, "lon":  2.444},
    {"name": "Blanes",            "lat": 41.672, "lon":  2.792},
    {"name": "Palamós",           "lat": 41.846, "lon":  3.129},
    {"name": "Roses",             "lat": 42.268, "lon":  3.178},
    {"name": "San Sebastián",     "lat": 43.320, "lon": -1.981},
    {"name": "Bilbao",            "lat": 43.363, "lon": -3.000},
    {"name": "Santander",         "lat": 43.462, "lon": -3.810},
    {"name": "Gijón",             "lat": 43.545, "lon": -5.663},
    {"name": "Avilés",            "lat": 43.557, "lon": -5.925},
    {"name": "A Coruña",          "lat": 43.371, "lon": -8.396},
    {"name": "Ferrol",            "lat": 43.484, "lon": -8.233},
    {"name": "Vigo",              "lat": 42.233, "lon": -8.723},
    {"name": "Palma de Mallorca", "lat": 39.570, "lon":  2.650},
    {"name": "Ibiza",             "lat": 38.907, "lon":  1.433},
    {"name": "Menorca",           "lat": 39.888, "lon":  4.259},
    {"name": "Las Palmas",        "lat": 28.124, "lon": -15.436},
    {"name": "Tenerife Sur",      "lat": 28.044, "lon": -16.572},
    {"name": "Lanzarote",         "lat": 28.963, "lon": -13.555},
    {"name": "Fuerteventura",     "lat": 28.499, "lon": -13.862},
    {"name": "La Palma",          "lat": 28.683, "lon": -17.764},
    {"name": "El Hierro",         "lat": 27.742, "lon": -17.980},
]

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    r = math.radians
    dlat = r(lat2 - lat1); dlon = r(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

app = Flask(__name__)

# --- BASE DE DATOS ---
def init_db():
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS preferencias (
            usuario TEXT PRIMARY KEY,
            widgets TEXT
        )
    ''')
    conn.commit()
    conn.close()

WIDGETS_DEFAULT = {
    'temperatura': True,
    'viento': True,
    'sol': True,
    'olas': True,
    'visibilidad': True,
    'presion': True,
    'temperatura_agua': True,
    'beaufort': True,
    'mareas': True,
    'prediccion': True,
}

def get_preferencias(usuario='default'):
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('SELECT widgets FROM preferencias WHERE usuario = ?', (usuario,))
    row = c.fetchone()
    conn.close()
    if row:
        return json.loads(row[0])
    return WIDGETS_DEFAULT.copy()

def save_preferencias(usuario, widgets):
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('''
        INSERT INTO preferencias (usuario, widgets)
        VALUES (?, ?)
        ON CONFLICT(usuario) DO UPDATE SET widgets = excluded.widgets
    ''', (usuario, json.dumps(widgets)))
    conn.commit()
    conn.close()

# --- CACHE DE DATOS ---
_cache = {}
_cache_time = 0
CACHE_SEGUNDOS = 300

def get_datos_maritimos():
    global _cache, _cache_time

    if _cache and (time.time() - _cache_time) < CACHE_SEGUNDOS:
        return _cache

    url_mar = 'https://marine-api.open-meteo.com/v1/marine'
    params_mar = {
        'latitude': 36.62,
        'longitude': -6.35,
        'hourly': 'wave_height,wave_direction,wave_period,sea_surface_temperature',
        'current': 'wave_height,wave_direction,wave_period',
        'timezone': 'Europe/Madrid',
        'forecast_days': 1
    }
    mar = requests.get(url_mar, params=params_mar, verify=False).json()
    alturas = mar['hourly']['wave_height']

    url_met = 'https://api.open-meteo.com/v1/forecast'
    params_met = {
        'latitude': 36.62,
        'longitude': -6.35,
        'current': 'temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,visibility,weather_code',
        'hourly': 'temperature_2m,wind_speed_10m',
        'daily': 'sunrise,sunset,wave_height_max',
        'timezone': 'Europe/Madrid',
        'forecast_days': 3
    }
    met = requests.get(url_met, params=params_met, verify=False).json()

    current = met['current']
    daily = met['daily']

    def grados_a_direccion(grados):
        dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO']
        return dirs[round(grados / 22.5) % 16]

    def beaufort(kmh):
        if kmh < 1: return 0
        elif kmh < 6: return 1
        elif kmh < 12: return 2
        elif kmh < 20: return 3
        elif kmh < 29: return 4
        elif kmh < 39: return 5
        elif kmh < 50: return 6
        elif kmh < 62: return 7
        elif kmh < 75: return 8
        elif kmh < 89: return 9
        elif kmh < 103: return 10
        elif kmh < 118: return 11
        return 12

    viento = round(current['wind_speed_10m'], 1)
    bf = beaufort(viento)

    # temperatura agua
    temp_agua = None
    if 'sea_surface_temperature' in mar.get('hourly', {}):
        temps = [t for t in mar['hourly']['sea_surface_temperature'] if t is not None]
        if temps:
            temp_agua = round(temps[0], 1)

    # predicción 3 días
    prediccion = []
    for i in range(3):
        prediccion.append({
            'fecha': daily['sunrise'][i][:10],
            'sunrise': daily['sunrise'][i][11:],
            'sunset': daily['sunset'][i][11:],
        })

    _cache = {
        'horas': [h[11:] for h in mar['hourly']['time']],
        'alturas': alturas,
        'altura_max': max(alturas),
        'altura_min': min(alturas),
        'altura_media': round(sum(alturas) / len(alturas), 2),
        'temperatura_c': round(current['temperature_2m'], 1),
        'sensacion_c': round(current['apparent_temperature'], 1),
        'viento_kmh': viento,
        'viento_dir': grados_a_direccion(current['wind_direction_10m']),
        'viento_grados': current['wind_direction_10m'],
        'racha_kmh': round(current['wind_gusts_10m'], 1),
        'presion': round(current['surface_pressure'], 1),
        'visibilidad': round(current.get('visibility', 0) / 1000, 1),
        'sunrise': daily['sunrise'][0][11:],
        'sunset': daily['sunset'][0][11:],
        'beaufort': bf,
        'temp_agua': temp_agua,
        'prediccion': prediccion,
    }
    _cache_time = time.time()
    return _cache

init_db()

# --- DASHBOARD CACHE ---
_dash_cache = {}
_dash_cache_time = {}
DASH_CACHE_SEGUNDOS = 600

def get_dash_cached(key, fetch_fn):
    now = time.time()
    if key in _dash_cache and now - _dash_cache_time.get(key, 0) < DASH_CACHE_SEGUNDOS:
        return _dash_cache[key]
    _dash_cache[key] = fetch_fn()
    _dash_cache_time[key] = now
    return _dash_cache[key]

def fetch_meteo(lat=36.62, lon=-6.35):
    r = requests.get('https://api.open-meteo.com/v1/forecast', params={
        'latitude': lat, 'longitude': lon,
        'hourly': 'temperature_2m,wind_speed_10m,precipitation,surface_pressure',
        'timezone': 'auto', 'forecast_days': 7
    }, verify=False, timeout=10).json()
    return {
        'time': r['hourly']['time'],
        'temp': r['hourly']['temperature_2m'],
        'wind': r['hourly']['wind_speed_10m'],
        'precip': r['hourly']['precipitation'],
        'pressure': r['hourly']['surface_pressure'],
    }

def fetch_oleaje(lat=36.62, lon=-6.35):
    r = requests.get('https://marine-api.open-meteo.com/v1/marine', params={
        'latitude': lat, 'longitude': lon,
        'hourly': 'wave_height,wave_direction,wave_period,sea_surface_temperature',
        'timezone': 'auto', 'forecast_days': 7
    }, verify=False, timeout=10).json()
    return {
        'time': r['hourly']['time'],
        'height': r['hourly']['wave_height'],
        'direction': r['hourly']['wave_direction'],
        'period': r['hourly']['wave_period'],
        'temp_agua': r['hourly']['sea_surface_temperature'],
    }

def fetch_mareas():
    try:
        r = requests.get(
            'https://portus.puertos.es/portusObs/api/tide/getPrediction',
            params={'stationId': '3304', 'date': '', 'numDays': 2},
            timeout=8, verify=False
        )
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return {
        'source': 'estimado',
        'extremes': [
            {'type': 'pleamar', 'time': '06:30', 'height': 2.8},
            {'type': 'bajamar', 'time': '12:45', 'height': 0.4},
            {'type': 'pleamar', 'time': '19:10', 'height': 2.6},
        ]
    }

def fetch_ais():
    if not AISHUB_USER:
        return {'vessels': [], 'note': 'Configura AISHUB_USER en .env'}
    try:
        r = requests.get('http://data.aishub.net/ws.php', params={
            'username': AISHUB_USER, 'format': '1', 'output': 'json',
            'compress': '0', 'latmin': '36.3', 'latmax': '37.0',
            'lonmin': '-7.0', 'lonmax': '-5.8'
        }, timeout=10).json()
        vessels = []
        if isinstance(r, list) and len(r) > 1:
            for v in r[1]:
                vessels.append({
                    'mmsi': v.get('MMSI'), 'name': v.get('NAME', 'Desconocido'),
                    'type': v.get('TYPE', '-'), 'lat': v.get('LATITUDE'),
                    'lon': v.get('LONGITUDE'), 'speed': v.get('SOG'), 'course': v.get('COG'),
                })
        return {'vessels': vessels}
    except Exception as e:
        return {'vessels': [], 'error': str(e)}

def fetch_alertas():
    if not AEMET_API_KEY:
        return {'alertas': [], 'note': 'Configura AEMET_API_KEY en .env'}
    try:
        r = requests.get(
            'https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/ESP/11',
            headers={'api_key': AEMET_API_KEY}, timeout=10, verify=False
        ).json()
        data_url = r.get('datos', '')
        if not data_url:
            return {'alertas': []}
        alerts_raw = requests.get(data_url, timeout=10, verify=False).json()
        alertas = []
        for a in (alerts_raw if isinstance(alerts_raw, list) else []):
            alertas.append({
                'titulo': a.get('event', a.get('headline', 'Aviso')),
                'descripcion': a.get('description', ''),
                'nivel': a.get('severity', 'verde').lower(),
                'inicio': a.get('onset', ''),
                'fin': a.get('expires', ''),
            })
        return {'alertas': alertas}
    except Exception as e:
        return {'alertas': [], 'error': str(e)}

def fetch_prediccion(lat=36.62, lon=-6.35):
    r = requests.get('https://api.open-meteo.com/v1/forecast', params={
        'latitude': lat, 'longitude': lon,
        'daily': 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code,sunrise,sunset',
        'timezone': 'auto', 'forecast_days': 7
    }, verify=False, timeout=10).json()
    daily = r['daily']
    days = []
    for i in range(7):
        days.append({
            'date': daily['time'][i],
            'temp_max': daily['temperature_2m_max'][i],
            'temp_min': daily['temperature_2m_min'][i],
            'precip': daily['precipitation_sum'][i],
            'wind_max': daily['wind_speed_10m_max'][i],
            'wave_max': None,
            'code': daily['weather_code'][i],
            'sunrise': daily['sunrise'][i][11:],
            'sunset': daily['sunset'][i][11:],
        })
    return {'days': days}

def fetch_calidad():
    r = requests.get('https://air-quality-api.open-meteo.com/v1/air-quality', params={
        'latitude': 36.62, 'longitude': -6.35,
        'hourly': 'pm10,pm2_5,ozone,uv_index,european_aqi',
        'timezone': 'Europe/Madrid', 'forecast_days': 1
    }, verify=False, timeout=10).json()
    h = r['hourly']
    from datetime import datetime
    hora = datetime.now().hour
    return {
        'pm10': h['pm10'][hora], 'pm25': h['pm2_5'][hora],
        'ozone': h['ozone'][hora], 'uv': h['uv_index'][hora],
        'aqi': h['european_aqi'][hora],
    }

_DASH_FETCHERS = {
    'meteo': fetch_meteo, 'oleaje': fetch_oleaje, 'mareas': fetch_mareas,
    'ais': fetch_ais, 'alertas': fetch_alertas,
    'prediccion': fetch_prediccion, 'calidad': fetch_calidad,
}

# --- RUTAS ---
@app.route('/')
def index():
    datos = get_datos_maritimos()
    prefs = get_preferencias()
    mapbox_key = os.environ.get('MAPBOX_KEY', '')
    return render_template('index.html', datos=datos, prefs=prefs, mapbox_key=mapbox_key)

@app.route('/api/datos')
def api_datos():
    return jsonify(get_datos_maritimos())

@app.route('/api/preferencias', methods=['GET'])
def api_get_prefs():
    return jsonify(get_preferencias())

@app.route('/api/preferencias', methods=['POST'])
def api_save_prefs():
    data = request.get_json()
    save_preferencias('default', data)
    return jsonify({'ok': True})

COORD_AWARE_TABS = {'meteo', 'oleaje', 'prediccion'}

@app.route('/api/localize')
def api_localize():
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if lat is None or lon is None:
        return jsonify({'error': 'lat y lon requeridos'}), 400
    nearest = min(COASTAL_POINTS, key=lambda p: haversine(lat, lon, p['lat'], p['lon']))
    dist = haversine(lat, lon, nearest['lat'], nearest['lon'])
    return jsonify({
        'name': nearest['name'],
        'coastal_lat': nearest['lat'],
        'coastal_lon': nearest['lon'],
        'distance_km': round(dist, 1),
    })

@app.route('/api/dashboard/<tab>')
def api_dashboard(tab):
    if tab not in _DASH_FETCHERS:
        return jsonify({'error': 'unknown tab'}), 404
    try:
        lat = request.args.get('lat', type=float)
        lon = request.args.get('lon', type=float)
        if lat is not None and lon is not None and tab in COORD_AWARE_TABS:
            return jsonify(_DASH_FETCHERS[tab](lat, lon))
        return jsonify(get_dash_cached(tab, _DASH_FETCHERS[tab]))
    except Exception as e:
        logging.error(f'Dashboard {tab}: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/debug')
def debug():
    return jsonify({
        'mapbox_key': os.environ.get('MAPBOX_KEY', 'NO ENCONTRADA')
    })

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))