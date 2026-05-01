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

import ais_stream
ais_stream.start()


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
    c.execute('''
        CREATE TABLE IF NOT EXISTS waypoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            descripcion TEXT,
            color TEXT DEFAULT '#4AC8E8',
            creado TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS vigilancia_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mmsi TEXT,
            nombre TEXT,
            amenaza TEXT,
            evento TEXT,
            velocidad REAL,
            lat REAL,
            lon REAL,
            ts TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS capturas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            especie TEXT NOT NULL,
            peso_kg REAL,
            longitud_cm REAL,
            lat REAL,
            lon REAL,
            fecha TEXT DEFAULT CURRENT_DATE,
            notas TEXT,
            condiciones TEXT,
            creado TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

# --- WAYPOINTS ---
def get_waypoints():
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('SELECT id, nombre, lat, lon, descripcion, color, creado FROM waypoints ORDER BY id DESC')
    rows = c.fetchall()
    conn.close()
    return [{'id': r[0], 'nombre': r[1], 'lat': r[2], 'lon': r[3],
             'descripcion': r[4], 'color': r[5], 'creado': r[6]} for r in rows]

def add_waypoint(nombre, lat, lon, descripcion='', color='#4AC8E8'):
    # Sanitize inputs
    nombre = str(nombre)[:50]
    descripcion = str(descripcion)[:200]
    color = color if (isinstance(color, str) and color.startswith('#') and len(color) <= 7) else '#4AC8E8'
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('INSERT INTO waypoints (nombre, lat, lon, descripcion, color) VALUES (?,?,?,?,?)',
              (nombre, float(lat), float(lon), descripcion, color))
    conn.commit()
    wp_id = c.lastrowid
    conn.close()
    return wp_id

def delete_waypoint(wp_id):
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('DELETE FROM waypoints WHERE id = ?', (int(wp_id),))
    conn.commit()
    conn.close()

# --- VIGILANCIA LOG ---
_vigilancia_seen: dict = {}  # mmsi -> last amenaza level

def log_vigilancia_event(mmsi, nombre, amenaza, evento, velocidad=None, lat=None, lon=None):
    from datetime import datetime, timezone
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('''INSERT INTO vigilancia_log (mmsi, nombre, amenaza, evento, velocidad, lat, lon, ts)
                 VALUES (?,?,?,?,?,?,?,?)''',
              (str(mmsi)[:20], str(nombre)[:100], str(amenaza)[:10], str(evento)[:50],
               velocidad, lat, lon,
               datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')))
    conn.commit()
    conn.close()

def get_vigilancia_log(limit=50):
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('''SELECT id, mmsi, nombre, amenaza, evento, velocidad, lat, lon, ts
                 FROM vigilancia_log ORDER BY id DESC LIMIT ?''', (limit,))
    rows = c.fetchall()
    conn.close()
    return [{'id':r[0],'mmsi':r[1],'nombre':r[2],'amenaza':r[3],'evento':r[4],
             'velocidad':r[5],'lat':r[6],'lon':r[7],'ts':r[8]} for r in rows]

# --- CAPTURAS ---
def get_capturas():
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('''SELECT id, especie, peso_kg, longitud_cm, lat, lon, fecha, notas, condiciones, creado
                 FROM capturas ORDER BY id DESC''')
    rows = c.fetchall()
    conn.close()
    return [{'id':r[0],'especie':r[1],'peso_kg':r[2],'longitud_cm':r[3],
             'lat':r[4],'lon':r[5],'fecha':r[6],'notas':r[7],
             'condiciones': json.loads(r[8]) if r[8] else {},
             'creado':r[9]} for r in rows]

def add_captura(especie, peso_kg=None, longitud_cm=None, lat=None, lon=None,
                fecha=None, notas='', condiciones=None):
    from datetime import date
    especie = str(especie)[:50]
    notas = str(notas)[:300]
    fecha = str(fecha or date.today().isoformat())[:10]
    cond_json = json.dumps(condiciones or {})
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('''INSERT INTO capturas (especie, peso_kg, longitud_cm, lat, lon, fecha, notas, condiciones)
                 VALUES (?,?,?,?,?,?,?,?)''',
              (especie,
               float(peso_kg) if peso_kg is not None else None,
               float(longitud_cm) if longitud_cm is not None else None,
               float(lat) if lat is not None else None,
               float(lon) if lon is not None else None,
               fecha, notas, cond_json))
    conn.commit()
    cap_id = c.lastrowid
    conn.close()
    return cap_id

def delete_captura(cap_id):
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('DELETE FROM capturas WHERE id = ?', (int(cap_id),))
    conn.commit()
    conn.close()

def get_capturas_stats():
    capturas = get_capturas()
    stats = {}
    for cap in capturas:
        sp = cap['especie']
        if sp not in stats:
            stats[sp] = {'count': 0, 'total_kg': 0.0, 'max_kg': 0.0}
        stats[sp]['count'] += 1
        if cap['peso_kg']:
            stats[sp]['total_kg'] = round(stats[sp]['total_kg'] + cap['peso_kg'], 2)
            stats[sp]['max_kg'] = round(max(stats[sp]['max_kg'], cap['peso_kg']), 2)
    return stats

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

# --- PRESION TREND ---
_presion_history = []  # list of (timestamp, hPa) — last 6 readings
_PRESION_TREND_MAX = 6

def _update_presion_history(presion):
    """Store pressure reading and compute trend."""
    import time as _time
    _presion_history.append((_time.time(), presion))
    if len(_presion_history) > _PRESION_TREND_MAX:
        _presion_history.pop(0)

def get_presion_trend():
    """Returns trend: 'subiendo', 'bajando', 'estable' and change rate hPa/h."""
    if len(_presion_history) < 2:
        return {'trend': 'estable', 'delta_h': 0.0, 'alert': False}
    oldest_ts, oldest_val = _presion_history[0]
    newest_ts, newest_val = _presion_history[-1]
    hours = (newest_ts - oldest_ts) / 3600
    if hours < 0.01:
        return {'trend': 'estable', 'delta_h': 0.0, 'alert': False}
    delta_h = (newest_val - oldest_val) / hours
    if delta_h > 1.0:
        trend = 'subiendo'
    elif delta_h < -1.0:
        trend = 'bajando'
    else:
        trend = 'estable'
    # Storm alert: pressure < 1000 hPa OR rapidly falling (> 3 hPa/h)
    alert = newest_val < 1000 or delta_h < -3.0
    return {'trend': trend, 'delta_h': round(delta_h, 2), 'alert': alert,
            'current': newest_val}

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
    # Track pressure history for trend
    _update_presion_history(round(current['surface_pressure'], 1))
    _cache['presion_trend'] = get_presion_trend()
    _cache_time = time.time()
    return _cache

init_db()

def _init_presion_history():
    """Bootstrap pressure history from last 24h of Open-Meteo data at startup."""
    try:
        import time as _time
        from datetime import datetime as _dt
        r = requests.get('https://api.open-meteo.com/v1/forecast', params={
            'latitude': 36.62, 'longitude': -6.35,
            'hourly': 'surface_pressure',
            'timezone': 'Europe/Madrid', 'past_days': 1, 'forecast_days': 1
        }, verify=False, timeout=8).json()
        times = r['hourly']['time']
        pressures = r['hourly']['surface_pressure']
        now_ts = _time.time()
        # Take readings at 6h intervals (last 24h)
        step = 6
        for i in range(0, min(len(times), 48), step):
            try:
                ts = _dt.fromisoformat(times[i])
                import datetime as _dtmod
                ts_utc = ts.replace(tzinfo=_dtmod.timezone.utc).timestamp() if ts.tzinfo is None else ts.timestamp()
                if ts_utc <= now_ts:
                    _presion_history.append((ts_utc, pressures[i]))
            except Exception:
                pass
        # Keep last 6
        while len(_presion_history) > _PRESION_TREND_MAX:
            _presion_history.pop(0)
        logging.info(f"Pressure history bootstrapped: {len(_presion_history)} readings")
    except Exception as e:
        logging.warning(f"Pressure history init failed: {e}")

# Initialize pressure history in background thread
import threading as _threading
_threading.Thread(target=_init_presion_history, daemon=True, name='presion-init').start()

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
        'hourly': 'temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation,surface_pressure,relative_humidity_2m,visibility',
        'current': 'temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,surface_pressure,relative_humidity_2m,weather_code,visibility',
        'timezone': 'auto', 'forecast_days': 7
    }, verify=False, timeout=10).json()
    current = r.get('current', {})
    return {
        'time': r['hourly']['time'],
        'temp': r['hourly']['temperature_2m'],
        'apparent_temp': r['hourly']['apparent_temperature'],
        'wind': r['hourly']['wind_speed_10m'],
        'wind_dir': r['hourly']['wind_direction_10m'],
        'precip': r['hourly']['precipitation'],
        'pressure': r['hourly']['surface_pressure'],
        'humidity': r['hourly']['relative_humidity_2m'],
        'visibility': r['hourly']['visibility'],
        'current': {
            'temp': current.get('temperature_2m'),
            'apparent_temp': current.get('apparent_temperature'),
            'wind': current.get('wind_speed_10m'),
            'wind_dir': current.get('wind_direction_10m'),
            'pressure': current.get('surface_pressure'),
            'humidity': current.get('relative_humidity_2m'),
            'code': current.get('weather_code'),
            'visibility_m': current.get('visibility'),
        },
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

def _calc_tidal_coefficient(extremes):
    """Calculate tidal coefficient (coeficiente de marea) 0-120.
    Based on tidal range: range_max * 100 / spring_range (approx 2.8m for Rota area).
    Coefficient 120 = máxima viva, 45 = mínima muerta.
    """
    try:
        highs = [e['height'] for e in extremes if e.get('type') == 'pleamar' and e.get('height')]
        lows = [e['height'] for e in extremes if e.get('type') == 'bajamar' and e.get('height')]
        if not highs or not lows:
            return None
        rng = max(highs) - min(lows)
        spring_range = 2.8  # Rota spring tidal range approx
        coef = min(120, max(10, round(rng / spring_range * 95)))
        return coef
    except Exception:
        return None

def fetch_mareas():
    try:
        r = requests.get(
            'https://portus.puertos.es/portusObs/api/tide/getPrediction',
            params={'stationId': '3304', 'date': '', 'numDays': 2},
            timeout=8, verify=False
        )
        if r.status_code == 200:
            data = r.json()
            extremes = data.get('extremes', [])
            coef = _calc_tidal_coefficient(extremes)
            data['coeficiente'] = coef
            return data
    except Exception:
        pass
    # Fallback with estimated data
    extremes = [
        {'type': 'pleamar', 'time': '06:30', 'height': 2.8},
        {'type': 'bajamar', 'time': '12:45', 'height': 0.4},
        {'type': 'pleamar', 'time': '19:10', 'height': 2.6},
    ]
    return {
        'source': 'estimado',
        'extremes': extremes,
        'coeficiente': _calc_tidal_coefficient(extremes),
    }

def fetch_ais():
    vessels = ais_stream.get_vessels()
    return {'vessels': vessels, 'count': len(vessels)}

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

    # Fetch wave height max per day from marine API
    wave_by_date = {}
    try:
        r_mar = requests.get('https://marine-api.open-meteo.com/v1/marine', params={
            'latitude': lat, 'longitude': lon,
            'daily': 'wave_height_max',
            'timezone': 'auto', 'forecast_days': 7
        }, verify=False, timeout=8).json()
        mar_daily = r_mar.get('daily', {})
        for i, d in enumerate(mar_daily.get('time', [])):
            wh = mar_daily.get('wave_height_max', [None]*7)
            wave_by_date[d] = wh[i] if i < len(wh) else None
    except Exception:
        pass

    days = []
    for i in range(7):
        date_str = daily['time'][i]
        days.append({
            'date': date_str,
            'temp_max': daily['temperature_2m_max'][i],
            'temp_min': daily['temperature_2m_min'][i],
            'precip': daily['precipitation_sum'][i],
            'wind_max': daily['wind_speed_10m_max'][i],
            'wave_max': wave_by_date.get(date_str),
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

# --- HISTORIAL AIS (últimas 10 posiciones por buque) ---
_ais_history: dict = {}  # mmsi -> list of {lat,lon,ts}
_ais_seen_last: dict = {}  # mmsi -> {vessel info, last_ts}

# AIS type codes to human readable names
AIS_TYPE_NAMES = {
    '20': 'Ala delta', '21': 'Aeronave', '22': 'Aeronave', '23': 'Aeronave',
    '24': 'Aeronave', '25': 'Aeronave', '26': 'Aeronave', '27': 'Aeronave',
    '28': 'Aeronave', '29': 'Aeronave',
    '30': 'Pesca', '31': 'Remolque', '32': 'Remolque largo',
    '33': 'Draga/operaciones subacuáticas', '34': 'Operaciones buceo',
    '35': 'Buque militar', '36': 'Velero', '37': 'Embarcación recreo',
    '38': 'Reservado', '39': 'Reservado',
    '40': 'Alta velocidad (HSC)', '41': 'HSC - Sin IMO',
    '42': 'HSC - DG', '43': 'HSC - Cargas peligrosas',
    '44': 'HSC - Otras', '49': 'HSC - Sin info',
    '50': 'Práctico', '51': 'Búsqueda y rescate (SAR)',
    '52': 'Remolcador', '53': 'Puerto/servicio',
    '54': 'Anticontaminación', '55': 'Agente de autoridad',
    '56': 'Reservado', '57': 'Reservado',
    '58': 'Embarcación médica', '59': 'Embarcación no combate SOLAS',
    '60': 'Pasajeros', '61': 'Pasajeros - Sin IMO',
    '62': 'Pasajeros - DG', '63': 'Pasajeros - Peligrosas',
    '64': 'Pasajeros - Otras', '69': 'Pasajeros',
    '70': 'Carga', '71': 'Carga - Sin IMO',
    '72': 'Carga - DG', '73': 'Carga - Peligrosas',
    '74': 'Carga - Otras', '79': 'Carga',
    '80': 'Tanquero', '81': 'Tanquero - Sin IMO',
    '82': 'Tanquero - DG', '83': 'Tanquero - Peligrosas',
    '84': 'Tanquero - Otras', '89': 'Tanquero',
    '90': 'Otro', '91': 'Otro', '92': 'Otro',
    '93': 'Otro', '94': 'Otro', '95': 'Otro',
    '96': 'Otro', '97': 'Otro', '98': 'Otro', '99': 'Otro',
}

def _ais_type_name(type_code):
    if not type_code:
        return 'Desconocido'
    code = str(type_code).strip()
    if code in AIS_TYPE_NAMES:
        return AIS_TYPE_NAMES[code]
    # Try prefix match
    prefix = code[:2] if len(code) >= 2 else code
    if prefix in AIS_TYPE_NAMES:
        return AIS_TYPE_NAMES[prefix]
    return f'Tipo {code}'

ROZ_CENTER_LAT = 36.6367
ROZ_CENTER_LON = -6.3493
ROZ_RADIUS_NM = 5.0

def _vessel_in_roz(lat, lon):
    """Returns True if vessel is within ROZ_RADIUS_NM of the ROZ center."""
    if lat is None or lon is None:
        return False
    dist_km = haversine(ROZ_CENTER_LAT, ROZ_CENTER_LON, lat, lon)
    return dist_km <= (ROZ_RADIUS_NM * 1.852)

def _classify_threat(vessel):
    """Classify vessel threat level: ROJO/AMARILLO/VERDE"""
    name = (vessel.get('name') or '').strip().upper()
    vtype = str(vessel.get('type') or '').strip().upper()
    # Military / unknown type without proper name
    military_types = {'35', '36', '37', 'MILITARY', 'LAW ENFORCEMENT'}
    if vtype in military_types:
        return 'ROJO'
    if not name or name in ('DESCONOCIDO', 'UNKNOWN', ''):
        return 'AMARILLO'
    if vtype in {'', '-', 'UNKNOWN', '0', 'NONE'}:
        return 'AMARILLO'
    return 'VERDE'

def _vessel_status(vessel):
    sog = vessel.get('speed')
    if sog is None:
        return 'DESCONOCIDO'
    if sog > 0.5:
        return 'EN MOVIMIENTO'
    return 'FONDEADO'

def fetch_vigilancia():
    import time as _time
    vessels_raw = ais_stream.get_vessels()
    now = _time.time()

    # Update history and seen_last
    current_mmsi_set = set()
    vessels_enriched = []
    for v in vessels_raw:
        mmsi = v.get('mmsi')
        if not mmsi:
            continue
        current_mmsi_set.add(mmsi)
        # Update position history (max 10)
        if mmsi not in _ais_history:
            _ais_history[mmsi] = []
        if v.get('lat') and v.get('lon'):
            hist = _ais_history[mmsi]
            if not hist or (hist[-1]['lat'] != v['lat'] or hist[-1]['lon'] != v['lon']):
                hist.append({'lat': v['lat'], 'lon': v['lon'], 'ts': now})
                if len(hist) > 10:
                    hist.pop(0)
        _ais_seen_last[mmsi] = {**v, '_last_ts': now}

        threat = _classify_threat(v)
        status = _vessel_status(v)
        type_name = _ais_type_name(v.get('type'))

        # Check if vessel is inside ROZ
        in_roz = _vessel_in_roz(v.get('lat'), v.get('lon'))

        # Log event if this is a new ROJO/AMARILLO vessel or new ROZ entry
        prev_threat = _vigilancia_seen.get(mmsi, {}).get('threat')
        prev_in_roz = _vigilancia_seen.get(mmsi, {}).get('in_roz', False)

        if threat in ('ROJO', 'AMARILLO') and prev_threat != threat:
            try:
                log_vigilancia_event(
                    mmsi=mmsi,
                    nombre=v.get('name', 'Desconocido'),
                    amenaza=threat,
                    evento='DETECTADO' if prev_threat is None else 'CAMBIO_AMENAZA',
                    velocidad=v.get('speed'),
                    lat=v.get('lat'),
                    lon=v.get('lon'),
                )
            except Exception:
                pass

        if in_roz and not prev_in_roz:
            try:
                log_vigilancia_event(
                    mmsi=mmsi,
                    nombre=v.get('name', 'Desconocido'),
                    amenaza=threat,
                    evento='EN_ROZ',
                    velocidad=v.get('speed'),
                    lat=v.get('lat'),
                    lon=v.get('lon'),
                )
            except Exception:
                pass

        _vigilancia_seen[mmsi] = {'threat': threat, 'in_roz': in_roz}

        vessels_enriched.append({
            **v,
            'type_name': type_name,
            'amenaza': threat,
            'estado': status,
            'in_roz': in_roz,
            'history': _ais_history.get(mmsi, []),
        })

    # Detect out-of-range vessels (seen before, now missing, last speed > 3kt)
    out_of_range = []
    for mmsi, last in _ais_seen_last.items():
        if mmsi in current_mmsi_set:
            continue
        age = now - last.get('_last_ts', now)
        if age < 1800:  # only if seen within last 30min
            sog = last.get('speed') or 0
            if sog > 3:
                from datetime import datetime
                out_of_range.append({
                    'mmsi': mmsi,
                    'name': last.get('name', 'Desconocido'),
                    'last_speed': sog,
                    'last_seen': datetime.fromtimestamp(last['_last_ts']).strftime('%H:%M'),
                    'amenaza': _classify_threat(last),
                })

    # ROZ Rota: 5nm radius from 36.6367N, 6.3493W
    ROZ_CENTER = {'lat': 36.6367, 'lon': -6.3493, 'radius_nm': 5}

    return {
        'vessels': vessels_enriched,
        'out_of_range': out_of_range,
        'roz': ROZ_CENTER,
        'total': len(vessels_enriched),
        'rojo': sum(1 for v in vessels_enriched if v['amenaza'] == 'ROJO'),
        'amarillo': sum(1 for v in vessels_enriched if v['amenaza'] == 'AMARILLO'),
        'verde': sum(1 for v in vessels_enriched if v['amenaza'] == 'VERDE'),
        'en_roz': sum(1 for v in vessels_enriched if v.get('in_roz')),
    }

# --- PESCA ---
def _moon_phase(date=None):
    """Calculate moon phase without external API. Returns phase 0-29 and name in Spanish."""
    from datetime import datetime, date as _date
    import math as _math
    if date is None:
        import datetime as _dt_mod
        date = _dt_mod.datetime.now(_dt_mod.timezone.utc).date()
    # Reference new moon: Jan 6, 2000
    ref = _date(2000, 1, 6)
    days = (date - ref).days
    cycle = 29.53058867
    phase_days = days % cycle
    if phase_days < 0:
        phase_days += cycle
    # Determine name
    if phase_days < 1.85:
        name = 'Luna Nueva'
        icon = '🌑'
    elif phase_days < 7.38:
        name = 'Cuarto Creciente'
        icon = '🌒'
    elif phase_days < 9.22:
        name = 'Cuarto Creciente'
        icon = '🌓'
    elif phase_days < 14.77:
        name = 'Luna Llena'
        icon = '🌕'
    elif phase_days < 16.61:
        name = 'Cuarto Menguante'
        icon = '🌖'
    elif phase_days < 22.15:
        name = 'Cuarto Menguante'
        icon = '🌗'
    elif phase_days < 23.99:
        name = 'Luna Nueva'
        icon = '🌘'
    else:
        name = 'Luna Nueva'
        icon = '🌑'
    return {'days': round(phase_days, 1), 'name': name, 'icon': icon}

# Species calendar for Bay of Cadiz by month (1=Jan ... 12=Dec)
SPECIES_CALENDAR = {
    'Dorada':      [1,2,3,10,11,12],
    'Lubina':      [1,2,3,4,9,10,11,12],
    'Atún':        [5,6,7,8,9],
    'Pargo':       [4,5,6,7,8,9,10],
    'Boquerón':    [3,4,5,6,7,8],
    'Caballa':     [3,4,5,6,7,8,9],
    'Lenguado':    [2,3,4,5,10,11],
    'Choco':       [1,2,3,10,11,12],
    'Gamba':       [1,2,3,4,10,11,12],
    'Langostino':  [4,5,6,7,8,9],
    'Pez espada':  [6,7,8,9],
    'Dentón':      [4,5,6,7,8,9,10],
}

CEBO_RECOMENDADO = {
    'Dorada':      {'cebo': 'Berberecho, mejillón, calamar', 'tecnica': 'Fondo con plomada', 'profundidad': 'fondo'},
    'Lubina':      {'cebo': 'Sardina, lanzón, gusano', 'tecnica': 'Curricán superficial o jigging', 'profundidad': 'superficie'},
    'Atún':        {'cebo': 'Pez volador, calamar, engodo', 'tecnica': 'Curricán de altura', 'profundidad': 'superficie'},
    'Pargo':       {'cebo': 'Calamar, sardina, cangrejo', 'tecnica': 'Fondo con palangrillo', 'profundidad': 'fondo'},
    'Boquerón':    {'cebo': 'Calamarín, luz UV nocturna', 'tecnica': 'Sabikis superficial', 'profundidad': 'superficie'},
    'Caballa':     {'cebo': 'Metal plateado, pluma, calamarín', 'tecnica': 'Jigging ligero', 'profundidad': 'media'},
    'Lenguado':    {'cebo': 'Gusano ragworm, calamar tira', 'tecnica': 'Arrastre lento de fondo', 'profundidad': 'fondo'},
    'Choco':       {'cebo': 'Pez vivo, señuelo choco', 'tecnica': 'Eging con jerking', 'profundidad': 'fondo'},
    'Gamba':       {'cebo': 'Red de arrastre ligero', 'tecnica': 'Rastro de fondo', 'profundidad': 'fondo'},
    'Langostino':  {'cebo': 'Red de cerco nocturna', 'tecnica': 'Red en fondos arenosos', 'profundidad': 'fondo'},
    'Pez espada':  {'cebo': 'Calamar, pez volador', 'tecnica': 'Palangre de altura de noche', 'profundidad': 'media'},
    'Dentón':      {'cebo': 'Calamar, sardina, pez', 'tecnica': 'Fondo en arrecife', 'profundidad': 'fondo'},
}

def _solunar_times(lat=36.637, lon=-6.362, date=None):
    """Calculate solunar major/minor times for a given location and date.
    Returns list of {time, type, duration_min} dicts.
    Based on simplified moon transit algorithm (mean values, ~15min accuracy).
    """
    from datetime import datetime, timezone, timedelta
    import math as _math
    if date is None:
        date = datetime.now(timezone.utc).date()

    # Julian day number
    y, m, d = date.year, date.month, date.day
    jd = 367*y - int(7*(y+int((m+9)/12))/4) + int(275*m/9) + d + 1721013.5

    # Mean lunar longitude (simplified)
    T = (jd - 2451545.0) / 36525.0
    L0 = (218.316 + 13.176396 * (jd - 2451545.0)) % 360  # Moon's mean longitude deg
    # Moon transit overhead at longitude lon: when moon is directly overhead
    # Approximate moon RA (simplified)
    moon_ra_h = (L0 / 360 * 24)  # rough hours

    # Longitude correction
    lon_offset = lon / 15.0  # hours

    # Major period 1: moon overhead
    major1_utc = (moon_ra_h - lon_offset) % 24
    # Major period 2: moon underfoot (12h later)
    major2_utc = (major1_utc + 12) % 24
    # Minor periods: 6h offset from majors (moonrise/moonset)
    minor1_utc = (major1_utc + 6) % 24
    minor2_utc = (major1_utc + 18) % 24

    # Convert UTC to local (Spain: UTC+1 in winter, UTC+2 in summer)
    # Simplified: use UTC+1 always (close enough for Rota, may be off by 1h in summer)
    utc_offset = 2  # CEST
    def to_local(h):
        return (h + utc_offset) % 24

    def fmt(h):
        return f"{int(h):02d}:{int((h%1)*60):02d}"

    return [
        {'time': fmt(to_local(major1_utc)), 'type': 'mayor', 'duration': 90, 'label': 'Luna en el meridiano'},
        {'time': fmt(to_local(major2_utc)), 'type': 'mayor', 'duration': 90, 'label': 'Luna bajo el horizonte'},
        {'time': fmt(to_local(minor1_utc)), 'type': 'menor', 'duration': 45, 'label': 'Luna en el este'},
        {'time': fmt(to_local(minor2_utc)), 'type': 'menor', 'duration': 45, 'label': 'Luna en el oeste'},
    ]

def fetch_pesca():
    from datetime import datetime
    import math as _math

    datos = get_datos_maritimos()
    wave_h = datos.get('altura_max', 0)
    wind_kmh = datos.get('viento_kmh', 0)
    visibility_km = datos.get('visibilidad', 10)
    pressure = datos.get('presion', 1013)

    # Tide state — use mareas data
    mareas = get_dash_cached('mareas', fetch_mareas)
    extremes = mareas.get('extremes', [])
    now_h = datetime.now().hour * 60 + datetime.now().minute
    tide_state = 'desconocido'
    best_fishing_hours = []

    if extremes:
        # Determine tide direction (entrante/saliente)
        for i in range(len(extremes) - 1):
            try:
                t1 = extremes[i]['time']
                t2 = extremes[i+1]['time']
                h1 = int(t1.split(':')[0]) * 60 + int(t1.split(':')[1])
                h2 = int(t2.split(':')[0]) * 60 + int(t2.split(':')[1])
                if h1 <= now_h <= h2:
                    tide_state = 'entrante' if extremes[i+1]['type'] == 'pleamar' else 'saliente'
                    break
            except Exception:
                pass

        # Best hours: 1h before/after each tide extreme
        for e in extremes:
            try:
                hh, mm = map(int, e['time'].split(':'))
                base = hh * 60 + mm
                for offset in [-60, 60]:
                    h2 = (base + offset) % 1440
                    best_fishing_hours.append(f"{h2//60:02d}:{h2%60:02d}")
            except Exception:
                pass

    # Sunrise/sunset windows (+30min after sunrise, -30min before sunset)
    try:
        sr = datos.get('sunrise', '07:00')
        ss = datos.get('sunset', '20:00')
        srh, srm = map(int, sr.split(':'))
        ssh, ssm = map(int, ss.split(':'))
        # 30min after sunrise
        sr_window = f"{(srh*60+srm+30)//60:02d}:{(srh*60+srm+30)%60:02d}"
        # 30min before sunset
        ss_window = f"{(ssh*60+ssm-30)//60:02d}:{(ssh*60+ssm-30)%60:02d}"
        best_fishing_hours = [sr_window] + best_fishing_hours + [ss_window]
    except Exception:
        pass

    # Fishing index (1-10)
    score = 0
    reasons_ok = []
    reasons_bad = []

    if wave_h < 1.0:
        score += 2; reasons_ok.append('Olas < 1m')
    elif wave_h < 1.5:
        score += 1
    else:
        reasons_bad.append(f'Olas altas ({wave_h:.1f}m)')

    if wind_kmh < 15:
        score += 2; reasons_ok.append('Viento ligero')
    elif wind_kmh < 25:
        score += 1
    else:
        reasons_bad.append(f'Viento fuerte ({wind_kmh:.0f} km/h)')

    if tide_state in ('entrante', 'saliente'):
        score += 2; reasons_ok.append(f'Marea {tide_state}')

    if visibility_km >= 5:
        score += 2; reasons_ok.append('Buena visibilidad')
    else:
        reasons_bad.append(f'Visibilidad reducida ({visibility_km}km)')

    # No rain approximated by weather code
    score += 2  # assume no rain (datos maritimos doesn't have precip directly)

    fishing_index = min(10, max(1, score))

    # Go/No-Go
    go = True
    limiter = None
    if wave_h > 2.0:
        go = False; limiter = f'Olas > 2m ({wave_h:.1f}m)'
    elif wind_kmh > 25:
        go = False; limiter = f'Viento > 25 km/h ({wind_kmh:.0f} km/h)'
    elif pressure < 995:
        go = False; limiter = f'Presión muy baja — posible tormenta ({pressure:.0f} hPa)'

    # Moon phase
    moon = _moon_phase()

    # Species in season (current month)
    month = datetime.now().month
    in_season = [s for s, months in SPECIES_CALENDAR.items() if month in months]
    off_season = [s for s in SPECIES_CALENDAR if s not in in_season]

    # Sea temp sparkline (last 7 days from cache)
    oleaje = get_dash_cached('oleaje', fetch_oleaje)
    temps_agua = [t for t in (oleaje.get('temp_agua') or []) if t is not None][:7*24:3]

    # Solunar times
    solunar = _solunar_times()

    # Barometric pressure advice
    presion_trend = get_presion_trend()
    if presion_trend.get('trend') == 'bajando' and not reasons_bad:
        reasons_ok.append('Presion bajando — picada activa inminente')
    elif presion_trend.get('trend') == 'bajando':
        reasons_ok.append('Presion bajando — buena picada esperada')

    # Cebo recommendations for in-season species
    species_with_cebo = [
        {**({'especie': s}), **CEBO_RECOMENDADO.get(s, {'cebo': '—', 'tecnica': '—', 'profundidad': '—'})}
        for s in in_season
    ]

    # Water temperature depth advice
    temp_agua = datos.get('temp_agua')
    if temp_agua is not None:
        if temp_agua < 16:
            profundidad_consejo = 'Agua fría — peces demersal en fondo (>15m). Técnicas de fondo recomendadas.'
            profundidad_color = '#4AC8E8'
        elif temp_agua < 20:
            profundidad_consejo = 'Agua templada — mixto fondo/media agua. Todas las técnicas funcionan.'
            profundidad_color = '#22c55e'
        else:
            profundidad_consejo = 'Agua cálida — peces pelágicos en superficie. Curricán y jigging superficial.'
            profundidad_color = '#f59e0b'
    else:
        profundidad_consejo = None
        profundidad_color = None

    return {
        'fishing_index': fishing_index,
        'go_nogo': {'go': go, 'limiter': limiter},
        'best_hours': sorted(set(best_fishing_hours)),
        'tide_state': tide_state,
        'moon': moon,
        'solunar': solunar,
        'species_in_season': in_season,
        'species_off_season': off_season,
        'species_with_cebo': species_with_cebo,
        'temp_agua_sparkline': temps_agua[:7],
        'temp_agua_current': datos.get('temp_agua'),
        'profundidad_consejo': profundidad_consejo,
        'profundidad_color': profundidad_color,
        'reasons_ok': reasons_ok,
        'reasons_bad': reasons_bad,
    }

def fetch_corrientes(lat=36.62, lon=-6.35):
    """Fetch ocean current data from Open-Meteo Marine API."""
    try:
        r = requests.get('https://marine-api.open-meteo.com/v1/marine', params={
            'latitude': lat, 'longitude': lon,
            'hourly': 'ocean_current_velocity,ocean_current_direction',
            'timezone': 'auto', 'forecast_days': 1
        }, verify=False, timeout=10).json()
        hourly = r.get('hourly', {})
        from datetime import datetime
        hora = datetime.now().hour
        velocidades = hourly.get('ocean_current_velocity', [])
        direcciones = hourly.get('ocean_current_direction', [])
        # Sample: take readings every 3h for the map overlay
        samples = []
        for i in range(0, min(len(velocidades), 24), 3):
            v = velocidades[i]
            d = direcciones[i] if i < len(direcciones) else None
            if v is not None and d is not None:
                samples.append({'vel': round(v, 2), 'dir': round(d, 1), 'hour': i})
        current_vel = velocidades[hora] if hora < len(velocidades) else None
        current_dir = direcciones[hora] if hora < len(direcciones) else None
        return {
            'current_vel': round(current_vel, 2) if current_vel is not None else None,
            'current_dir': round(current_dir, 1) if current_dir is not None else None,
            'samples': samples,
            'times': hourly.get('time', []),
        }
    except Exception as e:
        return {'current_vel': None, 'current_dir': None, 'samples': [], 'error': str(e)}

def fetch_manana():
    """Hour-by-hour conditions for tomorrow — same format as fetch_hoy."""
    from datetime import datetime, date, timedelta
    try:
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        r_met = requests.get('https://api.open-meteo.com/v1/forecast', params={
            'latitude': 36.62, 'longitude': -6.35,
            'hourly': 'wind_speed_10m,wind_gusts_10m,precipitation,weather_code',
            'timezone': 'Europe/Madrid', 'forecast_days': 2
        }, verify=False, timeout=10).json()
        r_mar = requests.get('https://marine-api.open-meteo.com/v1/marine', params={
            'latitude': 36.62, 'longitude': -6.35,
            'hourly': 'wave_height,wave_period',
            'timezone': 'Europe/Madrid', 'forecast_days': 2
        }, verify=False, timeout=10).json()

        hours = r_met['hourly']
        marine = r_mar['hourly']
        result_hours = []

        for i, t in enumerate(hours['time']):
            if not t.startswith(tomorrow):
                continue
            wind = (hours['wind_speed_10m'] or [0]*48)[i] or 0
            gusts = (hours['wind_gusts_10m'] or [0]*48)[i] or 0
            precip = (hours['precipitation'] or [0]*48)[i] or 0
            code = (hours['weather_code'] or [0]*48)[i] or 0
            wave_h = (marine['wave_height'] or [0]*48)[i] if i < len(marine.get('wave_height',[])) else 0
            wave_p = (marine['wave_period'] or [0]*48)[i] if i < len(marine.get('wave_period',[])) else 0
            if wave_h is None: wave_h = 0
            if wave_p is None: wave_p = 0

            score = 0
            if wind < 15: score += 3
            elif wind < 25: score += 2
            elif wind < 35: score += 1
            if wave_h < 0.8: score += 3
            elif wave_h < 1.5: score += 2
            elif wave_h < 2.5: score += 1
            if precip < 0.5: score += 2
            elif precip < 2: score += 1
            bad_codes = {80,81,82,95,96,99,73,75,77}
            if code not in bad_codes: score += 2

            color = '#22c55e' if score >= 8 else '#f59e0b' if score >= 5 else '#ef4444'
            result_hours.append({
                'time': t[11:],
                'wind': round(wind, 1),
                'gusts': round(gusts, 1),
                'wave_h': round(wave_h, 2),
                'wave_p': round(wave_p, 1),
                'precip': round(precip, 2),
                'code': code,
                'score': score,
                'color': color,
            })
        return {'hours': result_hours, 'date': tomorrow}
    except Exception as e:
        logging.error(f'fetch_manana: {e}')
        return {'hours': [], 'error': str(e)}

def fetch_routing(lat1=36.62, lon1=-6.35, lat2=36.72, lon2=-6.20):
    """Meteorological routing: conditions along a route A→B for the next 24h.
    Samples 5 intermediate points and returns per-hour conditions for each."""
    import math as _math
    try:
        # Interpolate 5 points along the route
        n_points = 5
        points = []
        for i in range(n_points):
            frac = i / (n_points - 1)
            plat = lat1 + (lat2 - lat1) * frac
            plon = lon1 + (lon2 - lon1) * frac
            points.append({'lat': round(plat, 4), 'lon': round(plon, 4)})

        # For simplicity, fetch meteo for start, mid, end points only (3 API calls)
        key_points = [points[0], points[2], points[4]]
        route_data = []

        for pt in key_points:
            try:
                r_met = requests.get('https://api.open-meteo.com/v1/forecast', params={
                    'latitude': pt['lat'], 'longitude': pt['lon'],
                    'hourly': 'wind_speed_10m,precipitation,weather_code',
                    'timezone': 'auto', 'forecast_days': 1
                }, verify=False, timeout=8).json()
                r_mar = requests.get('https://marine-api.open-meteo.com/v1/marine', params={
                    'latitude': pt['lat'], 'longitude': pt['lon'],
                    'hourly': 'wave_height',
                    'timezone': 'auto', 'forecast_days': 1
                }, verify=False, timeout=8).json()
                hours_met = r_met.get('hourly', {})
                hours_mar = r_mar.get('hourly', {})
                times = hours_met.get('time', [])
                from datetime import date
                today = date.today().isoformat()
                pt_hours = []
                for i, t in enumerate(times):
                    if not t.startswith(today): continue
                    wind = (hours_met.get('wind_speed_10m') or [0]*24)[i] or 0
                    wave = (hours_mar.get('wave_height') or [0]*24)[i] or 0
                    if wave is None: wave = 0
                    precip = (hours_met.get('precipitation') or [0]*24)[i] or 0
                    score = 0
                    if wind < 15: score += 3
                    elif wind < 25: score += 2
                    if wave < 0.8: score += 3
                    elif wave < 1.5: score += 2
                    if precip < 0.5: score += 2
                    pt_hours.append({'time': t[11:], 'wind': round(wind,1), 'wave': round(wave,2), 'score': score})
                route_data.append({'lat': pt['lat'], 'lon': pt['lon'], 'hours': pt_hours})
            except Exception:
                route_data.append({'lat': pt['lat'], 'lon': pt['lon'], 'hours': []})

        # Best departure: hour where all 3 points score >= 6
        best_departure = None
        if all(rd['hours'] for rd in route_data):
            for idx in range(min(len(rd['hours']) for rd in route_data)):
                if all(rd['hours'][idx]['score'] >= 6 for rd in route_data):
                    best_departure = route_data[0]['hours'][idx]['time']
                    break

        # Distance estimate (haversine)
        dist_km = haversine(lat1, lon1, lat2, lon2)
        return {
            'from': {'lat': lat1, 'lon': lon1},
            'to': {'lat': lat2, 'lon': lon2},
            'distance_km': round(dist_km, 1),
            'points': route_data,
            'best_departure': best_departure,
        }
    except Exception as e:
        return {'error': str(e), 'points': []}

def fetch_hoy():
    """Hour-by-hour conditions for today — sailing/fishing window analysis."""
    from datetime import datetime, date
    try:
        r_met = requests.get('https://api.open-meteo.com/v1/forecast', params={
            'latitude': 36.62, 'longitude': -6.35,
            'hourly': 'wind_speed_10m,wind_gusts_10m,precipitation,weather_code',
            'timezone': 'Europe/Madrid', 'forecast_days': 1
        }, verify=False, timeout=10).json()
        r_mar = requests.get('https://marine-api.open-meteo.com/v1/marine', params={
            'latitude': 36.62, 'longitude': -6.35,
            'hourly': 'wave_height,wave_period',
            'timezone': 'Europe/Madrid', 'forecast_days': 1
        }, verify=False, timeout=10).json()

        hours = r_met['hourly']
        marine = r_mar['hourly']
        result_hours = []
        today = date.today().isoformat()

        for i, t in enumerate(hours['time']):
            if not t.startswith(today):
                continue
            wind = (hours['wind_speed_10m'] or [0]*24)[i] or 0
            gusts = (hours['wind_gusts_10m'] or [0]*24)[i] or 0
            precip = (hours['precipitation'] or [0]*24)[i] or 0
            code = (hours['weather_code'] or [0]*24)[i] or 0
            wave_h = (marine['wave_height'] or [0]*24)[i] if i < len(marine.get('wave_height',[])  ) else 0
            wave_p = (marine['wave_period'] or [0]*24)[i] if i < len(marine.get('wave_period',[])) else 0
            if wave_h is None: wave_h = 0
            if wave_p is None: wave_p = 0

            # Compute window score
            score = 0
            if wind < 15: score += 3
            elif wind < 25: score += 2
            elif wind < 35: score += 1
            if wave_h < 0.8: score += 3
            elif wave_h < 1.5: score += 2
            elif wave_h < 2.5: score += 1
            if precip < 0.5: score += 2
            elif precip < 2: score += 1
            bad_codes = {80,81,82,95,96,99,73,75,77}
            if code not in bad_codes: score += 2

            color = '#22c55e' if score >= 8 else '#f59e0b' if score >= 5 else '#ef4444'

            result_hours.append({
                'time': t[11:],
                'wind': round(wind, 1),
                'gusts': round(gusts, 1),
                'wave_h': round(wave_h, 2),
                'wave_p': round(wave_p, 1),
                'precip': round(precip, 2),
                'code': code,
                'score': score,
                'color': color,
            })

        return {'hours': result_hours, 'date': today}
    except Exception as e:
        logging.error(f'fetch_hoy: {e}')
        return {'hours': [], 'error': str(e)}

_DASH_FETCHERS = {
    'meteo': fetch_meteo, 'oleaje': fetch_oleaje, 'mareas': fetch_mareas,
    'ais': fetch_ais, 'alertas': fetch_alertas,
    'prediccion': fetch_prediccion, 'calidad': fetch_calidad,
    'vigilancia': fetch_vigilancia, 'pesca': fetch_pesca,
    'hoy': fetch_hoy, 'manana': fetch_manana,
    'corrientes': fetch_corrientes,
}

# --- RUTAS ---
@app.route('/')
def index():
    datos = get_datos_maritimos()
    prefs = get_preferencias()
    mapbox_key = os.environ.get('MAPBOX_KEY', '')
    return render_template('index.html', datos=datos, prefs=prefs,
                           mapbox_key=mapbox_key, has_ais=bool(AISHUB_USER))

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

@app.route('/api/presion_trend')
def api_presion_trend():
    return jsonify(get_presion_trend())

@app.route('/api/briefing')
def api_briefing():
    """Generate a plain-text daily weather briefing for Rota area."""
    try:
        datos = get_datos_maritimos()
        from datetime import datetime
        now = datetime.now()

        wave_h = datos.get('altura_max', 0)
        wind_kmh = datos.get('viento_kmh', 0)
        wind_dir = datos.get('viento_dir', '?')
        racha = datos.get('racha_kmh', 0)
        presion = datos.get('presion', 1013)
        beaufort = datos.get('beaufort', 0)
        temp = datos.get('temperatura_c', 20)
        visibilidad = datos.get('visibilidad', 10)
        temp_agua = datos.get('temp_agua')
        sunrise = datos.get('sunrise', '?')
        sunset = datos.get('sunset', '?')

        bf_desc = ['calma','ventolina','brisa muy débil','brisa débil','brisa moderada',
                   'brisa fresca','brisa fuerte','viento fresco','temporal','temporal fuerte',
                   'temporal muy fuerte','borrasca','huracán']
        bf_text = bf_desc[beaufort] if beaufort < len(bf_desc) else 'muy fuerte'

        sea_state = ('mar llana' if wave_h < 0.1 else 'marejadilla' if wave_h < 1.25
                     else 'marejada' if wave_h < 2.5 else 'mar gruesa' if wave_h < 4 else 'mar muy gruesa')

        pres_trend = get_presion_trend()
        trend_text = {'subiendo': 'en ascenso', 'bajando': 'en descenso', 'estable': 'estable'}.get(
            pres_trend.get('trend', 'estable'), 'estable')

        # Go/No-Go
        go = wave_h <= 2.0 and wind_kmh <= 25 and presion >= 995
        go_text = 'FAVORABLE para navegación costera' if go else 'DESFAVORABLE — se recomienda no salir'

        lines = [
            f"PARTE METEOROLÓGICO — Bahía de Cádiz / Rota",
            f"Fecha: {now.strftime('%A %d de %B de %Y a las %H:%M')} (hora local)",
            f"",
            f"SITUACIÓN ACTUAL:",
            f"  Viento: {wind_dir} a {wind_kmh:.0f} km/h (BF {beaufort} — {bf_text}), rachas de {racha:.0f} km/h",
            f"  Oleaje: {sea_state}, altura máxima {wave_h:.1f}m",
            f"  Temperatura: {temp:.1f}°C en el aire",
        ]
        if temp_agua:
            lines.append(f"  Temperatura del agua: {temp_agua:.1f}°C")
        lines += [
            f"  Presión: {presion:.0f} hPa ({trend_text})",
            f"  Visibilidad: {visibilidad:.1f} km",
            f"",
            f"SOL: Salida {sunrise} — Puesta {sunset}",
            f"",
            f"CONDICIONES PARA LA NAVEGACIÓN: {go_text}",
        ]
        if pres_trend.get('alert'):
            lines.append(f"⚠ ALERTA BAROMÉTRICA: presión crítica o en descenso rápido")

        return jsonify({'briefing': '\n'.join(lines), 'go': go})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pesca_quick')
def api_pesca_quick():
    """Quick pesca index for overview badge — uses cached data only, fast."""
    try:
        datos = get_datos_maritimos()
        wave_h = datos.get('altura_max', 0)
        wind_kmh = datos.get('viento_kmh', 0)
        pressure = datos.get('presion', 1013)
        go = wave_h <= 2.0 and wind_kmh <= 25 and pressure >= 995
        score = 0
        if wave_h < 1.0: score += 2
        elif wave_h < 1.5: score += 1
        if wind_kmh < 15: score += 2
        elif wind_kmh < 25: score += 1
        score += 2  # visibility ok assumed
        score += 2  # no rain assumed
        score += 2  # tide assumed
        fishing_index = min(10, max(1, score))
        return jsonify({
            'fishing_index': fishing_index,
            'go': go,
            'wave_h': wave_h,
            'wind_kmh': wind_kmh,
        })
    except Exception as e:
        return jsonify({'error': str(e), 'fishing_index': 5, 'go': True}), 200

@app.route('/api/waypoints', methods=['GET'])
def api_get_waypoints():
    return jsonify({'waypoints': get_waypoints()})

@app.route('/api/waypoints', methods=['POST'])
def api_add_waypoint():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400
    try:
        lat = float(data.get('lat', 0))
        lon = float(data.get('lon', 0))
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return jsonify({'error': 'Invalid coordinates'}), 400
        wp_id = add_waypoint(
            nombre=data.get('nombre', 'Waypoint'),
            lat=lat, lon=lon,
            descripcion=data.get('descripcion', ''),
            color=data.get('color', '#4AC8E8')
        )
        return jsonify({'ok': True, 'id': wp_id})
    except (ValueError, TypeError) as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/waypoints/<int:wp_id>', methods=['DELETE'])
def api_delete_waypoint(wp_id):
    delete_waypoint(wp_id)
    return jsonify({'ok': True})

@app.route('/sw.js')
def service_worker():
    from flask import send_from_directory
    response = send_from_directory('static', 'sw.js', mimetype='application/javascript')
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Cache-Control'] = 'no-cache'
    return response

@app.route('/api/sst_grid')
def api_sst_grid():
    """Sea Surface Temperature grid around Rota — 5×5 points."""
    center_lat = float(request.args.get('lat', 36.62))
    center_lon = float(request.args.get('lon', -6.35))
    step = 0.15  # ~16km between points
    grid_points = []
    for dlat in [-2, -1, 0, 1, 2]:
        for dlon in [-2, -1, 0, 1, 2]:
            grid_points.append({
                'lat': round(center_lat + dlat * step, 4),
                'lon': round(center_lon + dlon * step, 4),
            })

    results = []
    # Batch: use one API call with comma-separated lat/lon is not supported by Open-Meteo
    # Use a reduced 3×3 grid to limit API calls (9 points)
    grid_3x3 = [p for i, p in enumerate(grid_points) if i in [0,2,4,10,12,14,20,22,24]]
    for pt in grid_3x3:
        try:
            r = requests.get('https://marine-api.open-meteo.com/v1/marine', params={
                'latitude': pt['lat'], 'longitude': pt['lon'],
                'current': 'sea_surface_temperature',
                'timezone': 'auto',
            }, verify=False, timeout=5).json()
            sst = r.get('current', {}).get('sea_surface_temperature')
            if sst is not None:
                results.append({'lat': pt['lat'], 'lon': pt['lon'], 'sst': round(sst, 1)})
        except Exception:
            pass

    return jsonify({'grid': results, 'center': {'lat': center_lat, 'lon': center_lon}})

@app.route('/api/puertos_cercanos')
def api_puertos_cercanos():
    """Nearest coastal points (ports/marinas) from user position."""
    lat = request.args.get('lat', type=float)
    lon = request.args.get('lon', type=float)
    if lat is None or lon is None:
        return jsonify({'error': 'lat y lon requeridos'}), 400
    points_with_dist = [
        {**p, 'distancia_km': round(haversine(lat, lon, p['lat'], p['lon']), 1)}
        for p in COASTAL_POINTS
    ]
    points_with_dist.sort(key=lambda x: x['distancia_km'])
    return jsonify({'puertos': points_with_dist[:5]})

@app.route('/api/ais_status')
def api_ais_status():
    return jsonify(ais_stream.get_status())

@app.route('/api/mareas_estado')
def api_mareas_estado():
    """Quick tide state for overview widget — current direction and next extreme with countdown."""
    from datetime import datetime
    try:
        mareas = get_dash_cached('mareas', fetch_mareas)
        extremes = mareas.get('extremes', [])
        now = datetime.now()
        now_min = now.hour * 60 + now.minute

        if not extremes:
            return jsonify({'estado': 'desconocido', 'proximo': None, 'countdown': None, 'coeficiente': None})

        coef = mareas.get('coeficiente')
        estado = 'desconocido'
        proximo_tipo = None
        proximo_time = None
        proximo_height = None
        min_diff = 9999

        for i in range(len(extremes)):
            try:
                hh, mm = map(int, extremes[i]['time'].split(':'))
                ext_min = hh * 60 + mm
                diff = ext_min - now_min
                if diff > 0 and diff < min_diff:
                    min_diff = diff
                    proximo_tipo = extremes[i]['type']
                    proximo_time = extremes[i]['time']
                    proximo_height = extremes[i].get('height')
                    # Current tide state: moving toward this extreme
                    if proximo_tipo == 'pleamar':
                        estado = 'entrante'
                    else:
                        estado = 'saliente'
            except Exception:
                pass

        # Fallback: if all extremes are in the past
        if proximo_tipo is None and extremes:
            proximo_tipo = extremes[0]['type']
            proximo_time = extremes[0]['time']
            proximo_height = extremes[0].get('height')
            estado = 'parada'

        # Countdown
        countdown = None
        if min_diff < 9999 and min_diff > 0:
            countdown = f"{min_diff // 60:02d}h {min_diff % 60:02d}m"

        return jsonify({
            'estado': estado,
            'proximo_tipo': proximo_tipo,
            'proximo_time': proximo_time,
            'proximo_height': proximo_height,
            'countdown': countdown,
            'coeficiente': coef,
        })
    except Exception as e:
        return jsonify({'estado': 'error', 'error': str(e)})

@app.route('/debug')
def debug():
    return jsonify({
        'mapbox_key': os.environ.get('MAPBOX_KEY', 'NO ENCONTRADA')
    })

# --- VIGILANCIA LOG ---
@app.route('/api/vigilancia_log')
def api_vigilancia_log():
    limit = min(int(request.args.get('limit', 50)), 200)
    return jsonify({'log': get_vigilancia_log(limit)})

# --- CAPTURAS ---
@app.route('/api/capturas', methods=['GET'])
def api_get_capturas():
    return jsonify({'capturas': get_capturas(), 'stats': get_capturas_stats()})

@app.route('/api/capturas', methods=['POST'])
def api_add_captura():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400
    try:
        # Snapshot current conditions for context
        try:
            datos = get_datos_maritimos()
            cond = {
                'olas_m': datos.get('altura_max'),
                'viento_kmh': datos.get('viento_kmh'),
                'presion_hpa': datos.get('presion'),
                'temp_agua': datos.get('temp_agua'),
                'beaufort': datos.get('beaufort'),
            }
        except Exception:
            cond = {}
        cap_id = add_captura(
            especie=data.get('especie', 'Desconocida'),
            peso_kg=data.get('peso_kg'),
            longitud_cm=data.get('longitud_cm'),
            lat=data.get('lat'),
            lon=data.get('lon'),
            fecha=data.get('fecha'),
            notas=data.get('notas', ''),
            condiciones=cond,
        )
        return jsonify({'ok': True, 'id': cap_id})
    except (ValueError, TypeError) as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/capturas/<int:cap_id>', methods=['DELETE'])
def api_delete_captura(cap_id):
    delete_captura(cap_id)
    return jsonify({'ok': True})

# --- ROUTING METEOROLÓGICO ---
@app.route('/api/routing')
def api_routing():
    try:
        lat1 = float(request.args.get('lat1', 36.62))
        lon1 = float(request.args.get('lon1', -6.35))
        lat2 = float(request.args.get('lat2', 36.72))
        lon2 = float(request.args.get('lon2', -6.20))
        for v in [lat1, lon1, lat2, lon2]:
            if not isinstance(v, float):
                raise ValueError('Invalid coordinate')
        if not (-90 <= lat1 <= 90 and -90 <= lat2 <= 90):
            return jsonify({'error': 'Invalid lat'}), 400
        if not (-180 <= lon1 <= 180 and -180 <= lon2 <= 180):
            return jsonify({'error': 'Invalid lon'}), 400
        return jsonify(fetch_routing(lat1, lon1, lat2, lon2))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))