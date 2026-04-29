from flask import Flask, render_template, jsonify, request
import requests
import time
import urllib3
import sqlite3
import json
import os
from dotenv import load_dotenv
load_dotenv()
urllib3.disable_warnings()


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

@app.route('/debug')
def debug():
    return jsonify({
        'mapbox_key': os.environ.get('MAPBOX_KEY', 'NO ENCONTRADA')
    })

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))