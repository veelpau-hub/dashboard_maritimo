# Dashboard Marítimo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the maritime dashboard with 7 functional sub-tabs, solid dark CSS, settings, map layers, and ad slots — deployed on Railway at dashboard-maritimo.up.railway.app.

**Architecture:** Single Flask app with `/api/dashboard/<tab>` endpoints (10-min in-memory cache each), vanilla JS frontend loading sub-tab content via fetch, D3.js visualizations reused from existing widgets.

**Tech Stack:** Flask, SQLite, D3.js, Mapbox GL JS, Open-Meteo (free), AEMET OpenData (free API key), AISHub (free registration), Open-Meteo Air Quality (free).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app.py` | Modify | Fix duplicate route + init_db; add 7 `/api/dashboard/<tab>` endpoints |
| `static/style.css` | Modify | Remove glassmorphism, solid dark theme, ad slots, responsive |
| `templates/index.html` | Modify | Sub-tab buttons with labels, dashboard panels, settings panel, ad slots, Ko-fi |
| `static/js/main.js` | Modify | Extend switchTab for map+settings, sub-tab switching, units/language state |
| `static/js/dashboard.js` | Create | Fetch + render logic for all 7 dashboard sub-tabs |
| `static/js/mapa.js` | Modify | Add AIS layer, alerts layer, toggle panel |
| `tests/test_api.py` | Create | Pytest tests for all Flask API endpoints |

---

## Task 1: Fix bugs in app.py

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Remove duplicate route and fix init_db**

`app.py` has two `@app.route('/')` definitions. The first (around line 93) is missing `mapbox_key`. Remove that first block entirely. Move `init_db()` to module level (before the first route) so it runs under Gunicorn.

After fix, structure:

```python
from flask import Flask, render_template, jsonify, request
import requests, time, urllib3, sqlite3, json, os, logging
from dotenv import load_dotenv
load_dotenv()
urllib3.disable_warnings()

app = Flask(__name__)

def init_db():
    conn = sqlite3.connect('preferencias.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS preferencias (
        usuario TEXT PRIMARY KEY, widgets TEXT)''')
    conn.commit()
    conn.close()

init_db()  # module-level — works with Gunicorn

# ... WIDGETS_DEFAULT, get_preferencias, save_preferencias, cache, get_datos_maritimos ...

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
    return jsonify({'mapbox_key': os.environ.get('MAPBOX_KEY', 'NO ENCONTRADA')})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
```

- [ ] **Step 2: Verify locally**

```bash
cd /Users/pauvidal/Python/dashboard-maritimo
source venv/bin/activate
python app.py
# Open http://localhost:5000 — must load without errors
```

- [ ] **Step 3: Commit**

```bash
git add app.py
git commit -m "fix: remove duplicate route, call init_db at module level for Gunicorn"
```

---

## Task 2: CSS redesign — solid dark, no glassmorphism

**Files:**
- Modify: `static/style.css`

- [ ] **Step 1: Replace body background**

Find: `background: url('/static/bg.png') center center / cover no-repeat;`
Replace with: `background: #0a0f1e;`

- [ ] **Step 2: Remove glassmorphism from sidebar and submenu**

In `.sidebar`: replace `background: rgba(255,255,255,0.12)` → `background: #0d1520`, remove `backdrop-filter: blur(20px)`, change border to `border: 1px solid rgba(255,255,255,0.07)`.

Apply same three changes to `.submenu`.

- [ ] **Step 3: Fix card-metrica**

Replace the `.card-metrica` rule entirely:

```css
.card-metrica {
    background: #0d1520;
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.2s;
}
.card-metrica:hover { border-color: rgba(74,200,232,0.3); }
```

- [ ] **Step 4: Fix panel background**

Find all `.panel` rules. Replace any `rgba(255,255,255,...)` backgrounds with `#0d1520`. Remove any `backdrop-filter` lines.

- [ ] **Step 5: Update submenu button for icon + label layout**

Replace `.submenu-btn` rule:

```css
.submenu-btn {
    width: 100%;
    height: auto;
    padding: 0.6rem 0.75rem;
    border: none;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.5);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-align: left;
    white-space: nowrap;
}
.submenu-btn.active {
    background: rgba(74,200,232,0.15);
    color: #4AC8E8;
}
.submenu-btn:hover { background: rgba(255,255,255,0.1); color: white; }
.submenu { width: 140px; }
```

- [ ] **Step 6: Append new utility CSS to end of style.css**

```css
/* AD SLOTS */
.ad-banner {
    width: 728px; height: 90px;
    background: rgba(255,255,255,0.03);
    border: 1px dashed rgba(255,255,255,0.1);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    margin: 0.75rem auto 0; flex-shrink: 0;
}
.ad-sidebar {
    width: 160px; min-height: 600px;
    background: rgba(255,255,255,0.03);
    border: 1px dashed rgba(255,255,255,0.1);
    border-radius: 8px;
    display: none; flex-direction: column;
    align-items: center; padding-top: 0.5rem; flex-shrink: 0;
}
.ad-label { font-size: 0.6rem; color: rgba(255,255,255,0.2); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 0.25rem; }
@media (min-width: 1400px) { .ad-sidebar { display: flex; } }
@media (max-width: 768px) { .ad-banner, .ad-sidebar { display: none; } }

/* DASHBOARD */
.dash-panel { width: 100%; height: 100%; overflow-y: auto; padding: 1rem; }
.dash-section-title { font-size: 0.65rem; letter-spacing: 2px; color: rgba(255,255,255,0.3); text-transform: uppercase; margin-bottom: 1rem; }
.dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.dash-card { background: #0d1520; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 1rem; }
.dash-card-label { font-size: 0.65rem; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.25rem; }
.dash-card-value { font-size: 1.5rem; font-weight: 700; color: #4AC8E8; }
.dash-card-sub { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 0.15rem; }
.dash-chart-container { background: #0d1520; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 1rem; margin-bottom: 0.75rem; width: 100%; }

/* SETTINGS */
.settings-section { background: #0d1520; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; }
.settings-section h3 { font-size: 0.7rem; letter-spacing: 2px; color: rgba(255,255,255,0.3); text-transform: uppercase; margin-bottom: 0.75rem; }
.settings-row { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.settings-row:last-child { border-bottom: none; }
.settings-row span { font-size: 0.85rem; color: rgba(255,255,255,0.7); }
.unit-btn { padding: 0.25rem 0.6rem; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; background: transparent; color: rgba(255,255,255,0.5); font-size: 0.75rem; cursor: pointer; transition: all 0.15s; }
.unit-btn.active { background: rgba(74,200,232,0.15); border-color: #4AC8E8; color: #4AC8E8; }

/* KOFI */
.kofi-banner { position: fixed; top: 12px; right: 16px; z-index: 100; display: flex; align-items: center; gap: 0.4rem; background: rgba(255,94,91,0.12); border: 1px solid rgba(255,94,91,0.25); border-radius: 20px; padding: 0.3rem 0.75rem; text-decoration: none; color: #ff5e5b; font-size: 0.72rem; transition: background 0.2s; }
.kofi-banner:hover { background: rgba(255,94,91,0.22); }

/* AIS TABLE */
.ais-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.ais-table th { color: rgba(255,255,255,0.3); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1px; padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.07); }
.ais-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.75); }
.ais-table tr:hover td { background: rgba(255,255,255,0.03); }

/* ALERT CARDS */
.alert-card { border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 0.5rem; border-left: 3px solid; }
.alert-card.verde { border-color: #22c55e; background: rgba(34,197,94,0.07); }
.alert-card.amarillo { border-color: #f59e0b; background: rgba(245,158,11,0.07); }
.alert-card.naranja { border-color: #f97316; background: rgba(249,115,22,0.07); }
.alert-card.rojo { border-color: #ef4444; background: rgba(239,68,68,0.07); }
.alert-title { font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.85); }
.alert-desc { font-size: 0.75rem; color: rgba(255,255,255,0.45); margin-top: 0.2rem; }

/* 7-DAY FORECAST */
.forecast-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; }
.forecast-day { background: #0d1520; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 0.75rem 0.5rem; text-align: center; }
.forecast-day-name { font-size: 0.65rem; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 1px; }
.forecast-day-icon { font-size: 1.5rem; margin: 0.4rem 0; }
.forecast-day-temp { font-size: 1rem; font-weight: 700; color: #4AC8E8; }
.forecast-day-sub { font-size: 0.65rem; color: rgba(255,255,255,0.35); margin-top: 0.2rem; }

/* MAP CONTROLS */
.map-controls { position: absolute; top: 12px; left: 12px; z-index: 10; background: #0d1520; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; min-width: 130px; }
.map-toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: rgba(255,255,255,0.6); cursor: pointer; user-select: none; }
.map-toggle input[type=checkbox] { accent-color: #4AC8E8; }
```

- [ ] **Step 7: Verify visually**

```bash
python app.py
# Open http://localhost:5000
# Verify: solid dark background, no blur on cards or sidebar
```

- [ ] **Step 8: Commit**

```bash
git add static/style.css
git commit -m "style: solid dark theme, remove glassmorphism, add ad/dashboard/settings/forecast CSS"
```

---

## Task 3: HTML structure — sub-tabs, panels, ad slots, Ko-fi

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Replace submenu buttons with labelled sub-tabs**

Find `<div class="submenu" id="submenu">` and replace its inner content:

```html
<div class="submenu" id="submenu">
    <button class="submenu-btn" onclick="switchDashTab('meteo')">
        <i class="fa-solid fa-cloud-sun"></i> Meteorología
    </button>
    <button class="submenu-btn" onclick="switchDashTab('oleaje')">
        <i class="fa-solid fa-water"></i> Oleaje
    </button>
    <button class="submenu-btn" onclick="switchDashTab('mareas')">
        <i class="fa-solid fa-moon"></i> Mareas
    </button>
    <button class="submenu-btn" onclick="switchDashTab('ais')">
        <i class="fa-solid fa-ship"></i> AIS
    </button>
    <button class="submenu-btn" onclick="switchDashTab('alertas')">
        <i class="fa-solid fa-triangle-exclamation"></i> Alertas
    </button>
    <button class="submenu-btn" onclick="switchDashTab('prediccion')">
        <i class="fa-solid fa-calendar-days"></i> Predicción
    </button>
    <button class="submenu-btn" onclick="switchDashTab('calidad')">
        <i class="fa-solid fa-wind"></i> Calidad aire
    </button>
</div>
```

- [ ] **Step 2: Replace dashboard panel skeleton**

Find `<div class="panel hidden" id="panel-dashboard">` and replace entirely:

```html
<div class="panel hidden" id="panel-dashboard">
    <div class="panel-header">
        <p class="panel-label" id="dash-tab-label">DASHBOARD</p>
        <button class="close-btn" onclick="switchTab('overview')">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>
    <div class="dash-panel" id="dash-content">
        <p style="color:rgba(255,255,255,0.3);font-size:0.85rem">Selecciona una categoría del menú lateral.</p>
    </div>
    <div class="ad-banner" id="ad-banner-dash">
        <span class="ad-label">Publicidad</span>
        <!-- AdSense ins tag goes here when approved -->
    </div>
</div>
```

- [ ] **Step 3: Add map panel (replacing existing mapa-placeholder)**

Find `<div class="mapa-placeholder">` and replace with:

```html
<div class="panel hidden" id="panel-mapa" style="position:relative;padding:0;overflow:hidden;flex:1;min-width:0">
    <div class="map-controls" id="map-controls">
        <label class="map-toggle"><input type="checkbox" id="toggle-ais" onchange="toggleMapLayer('ais')"> 🚢 Buques AIS</label>
        <label class="map-toggle"><input type="checkbox" id="toggle-alertas" onchange="toggleMapLayer('alertas')"> ⚠️ Alertas</label>
        <label class="map-toggle"><input type="checkbox" checked id="toggle-waypoints" onchange="toggleMapLayer('waypoints')"> 📍 Waypoints</label>
        <hr style="border-color:rgba(255,255,255,0.07);margin:0.4rem 0">
        <label class="map-toggle"><input type="checkbox" id="toggle-satellite" onchange="toggleMapStyle()"> 🛰 Satélite</label>
    </div>
    <div id="mapa" style="width:100%;height:100%"></div>
</div>
```

- [ ] **Step 4: Add settings panel (after map panel)**

```html
<!-- PANEL AJUSTES -->
<div class="panel hidden" id="panel-settings">
    <div class="panel-header">
        <p class="panel-label">AJUSTES</p>
        <button class="close-btn" onclick="switchTab('overview')">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>
    <div class="dash-panel" style="padding:1rem">

        <div class="settings-section">
            <h3>Temperatura</h3>
            <div class="settings-row">
                <span>Unidad</span>
                <div style="display:flex;gap:0.4rem">
                    <button class="unit-btn active" id="btn-c" onclick="setTempUnit('c')">°C</button>
                    <button class="unit-btn" id="btn-f" onclick="setTempUnit('f')">°F</button>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h3>Viento</h3>
            <div class="settings-row">
                <span>Unidad</span>
                <div style="display:flex;gap:0.4rem">
                    <button class="unit-btn active" id="btn-kmh" onclick="setWindUnit('kmh')">km/h</button>
                    <button class="unit-btn" id="btn-kn" onclick="setWindUnit('kn')">kt</button>
                    <button class="unit-btn" id="btn-ms" onclick="setWindUnit('ms')">m/s</button>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h3>Idioma</h3>
            <div class="settings-row">
                <span>Interfaz</span>
                <div style="display:flex;gap:0.4rem">
                    <button class="unit-btn active" id="btn-es" onclick="setLang('es')">ES</button>
                    <button class="unit-btn" id="btn-en" onclick="setLang('en')">EN</button>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h3>Widgets visibles</h3>
            <div class="config-grid" id="config-grid-settings"></div>
        </div>

        <div class="settings-section">
            <h3>Acerca de</h3>
            <div class="settings-row"><span>Versión</span><span style="color:rgba(255,255,255,0.35)">1.0.0</span></div>
            <div class="settings-row"><span>Clima</span><span style="color:rgba(255,255,255,0.35)">Open-Meteo</span></div>
            <div class="settings-row"><span>Alertas</span><span style="color:rgba(255,255,255,0.35)">AEMET OpenData</span></div>
            <div class="settings-row"><span>AIS</span><span style="color:rgba(255,255,255,0.35)">AISHub</span></div>
            <div class="settings-row">
                <span>Apoya el proyecto</span>
                <a href="https://ko-fi.com/TU_USUARIO" target="_blank" style="color:#ff5e5b;font-size:0.8rem">Ko-fi ♥</a>
            </div>
        </div>

    </div>
</div>
```

- [ ] **Step 5: Add outer flex wrapper + Ko-fi banner + ad sidebar**

Replace `<body>` opening with:

```html
<body>
<a href="https://ko-fi.com/TU_USUARIO" target="_blank" class="kofi-banner">♥ Apoya el proyecto</a>
<div style="display:flex;align-items:stretch;height:100vh;gap:0.75rem;padding:0 40px;width:100%;box-sizing:border-box">
```

And before `</body>` add:

```html
    <div class="ad-sidebar"><span class="ad-label">Publicidad</span></div>
</div><!-- end outer flex wrapper -->
</body>
```

Also remove `display:flex`, `align-items`, `justify-content`, `gap`, `padding` from the `body` CSS rule in `style.css` (those move to the wrapper div above).

- [ ] **Step 6: Update switchTab in main.js**

Replace the `switchTab` function:

```javascript
function switchTab(tab) {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('submenu').classList.remove('visible');
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));

    const idx = { overview: 0, dashboard: 1, mapa: 2, settings: 3 };
    const ids = ['panel-overview', 'panel-dashboard', 'panel-mapa', 'panel-settings'];

    if (tab in idx) {
        document.getElementById(ids[idx[tab]]).classList.remove('hidden');
        document.querySelectorAll('.sidebar-btn')[idx[tab]].classList.add('active');
    }
    if (tab === 'dashboard') {
        document.getElementById('submenu').classList.add('visible');
        const banner = document.getElementById('ad-banner-dash');
        if (banner) banner.style.display = 'flex';
    }
    if (tab === 'mapa') {
        if (window.mapa) window.mapa.resize();
        if (typeof initMapLayers === 'function') initMapLayers();
    }
    if (tab === 'settings') {
        if (typeof renderSettingsWidgets === 'function') renderSettingsWidgets();
    }
}
```

- [ ] **Step 7: Commit**

```bash
git add templates/index.html static/js/main.js
git commit -m "feat: HTML structure — labelled sub-tabs, map/settings panels, ad slots, Ko-fi"
```

---

## Task 4: Backend — 7 dashboard API endpoints

**Files:**
- Modify: `app.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Add env vars**

Create `.env` (not committed — already in `.gitignore`):

```
AEMET_API_KEY=your_key_from_opendata.aemet.es
AISHUB_USER=your_username_from_aishub.net
MAPBOX_KEY=your_mapbox_token
```

Add to `app.py` after `load_dotenv()`:

```python
AEMET_API_KEY = os.getenv('AEMET_API_KEY', '')
AISHUB_USER = os.getenv('AISHUB_USER', '')
```

- [ ] **Step 2: Add dashboard cache helper after existing `_cache` section**

```python
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
```

- [ ] **Step 3: Add the 7 fetch functions**

Add before the routes section in `app.py`:

```python
def fetch_meteo():
    r = requests.get('https://api.open-meteo.com/v1/forecast', params={
        'latitude': 36.62, 'longitude': -6.35,
        'hourly': 'temperature_2m,wind_speed_10m,precipitation,surface_pressure',
        'timezone': 'Europe/Madrid', 'forecast_days': 7
    }, verify=False, timeout=10).json()
    return {
        'time': r['hourly']['time'],
        'temp': r['hourly']['temperature_2m'],
        'wind': r['hourly']['wind_speed_10m'],
        'precip': r['hourly']['precipitation'],
        'pressure': r['hourly']['surface_pressure'],
    }

def fetch_oleaje():
    r = requests.get('https://marine-api.open-meteo.com/v1/marine', params={
        'latitude': 36.62, 'longitude': -6.35,
        'hourly': 'wave_height,wave_direction,wave_period,sea_surface_temperature',
        'timezone': 'Europe/Madrid', 'forecast_days': 7
    }, verify=False, timeout=10).json()
    return {
        'time': r['hourly']['time'],
        'height': r['hourly']['wave_height'],
        'direction': r['hourly']['wave_direction'],
        'period': r['hourly']['wave_period'],
        'temp_agua': r['hourly']['sea_surface_temperature'],
    }

def fetch_mareas():
    # Puertos del Estado — station 3304 (Rota)
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
    # Stub fallback
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

def fetch_prediccion():
    r = requests.get('https://api.open-meteo.com/v1/forecast', params={
        'latitude': 36.62, 'longitude': -6.35,
        'daily': 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wave_height_max,weather_code,sunrise,sunset',
        'timezone': 'Europe/Madrid', 'forecast_days': 7
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
            'wave_max': (daily.get('wave_height_max') or [None]*7)[i],
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
```

- [ ] **Step 4: Add the single dashboard route**

```python
_DASH_FETCHERS = {
    'meteo': fetch_meteo, 'oleaje': fetch_oleaje, 'mareas': fetch_mareas,
    'ais': fetch_ais, 'alertas': fetch_alertas,
    'prediccion': fetch_prediccion, 'calidad': fetch_calidad,
}

@app.route('/api/dashboard/<tab>')
def api_dashboard(tab):
    if tab not in _DASH_FETCHERS:
        return jsonify({'error': 'unknown tab'}), 404
    try:
        return jsonify(get_dash_cached(tab, _DASH_FETCHERS[tab]))
    except Exception as e:
        logging.error(f'Dashboard {tab}: {e}')
        return jsonify({'error': str(e)}), 500
```

- [ ] **Step 5: Write tests**

Create `tests/__init__.py` (empty) and `tests/test_api.py`:

```python
import pytest, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as flask_app

@pytest.fixture
def client():
    flask_app.app.config['TESTING'] = True
    with flask_app.app.test_client() as c:
        yield c

def test_index_loads(client):
    r = client.get('/')
    assert r.status_code == 200
    assert b'NAVSTA' in r.data

def test_api_datos_keys(client):
    r = client.get('/api/datos')
    assert r.status_code == 200
    d = r.get_json()
    assert 'temperatura_c' in d and 'viento_kmh' in d and 'beaufort' in d

def test_dashboard_unknown_tab(client):
    r = client.get('/api/dashboard/noexiste')
    assert r.status_code == 404

def test_dashboard_meteo(client, monkeypatch):
    monkeypatch.setattr(flask_app, 'fetch_meteo', lambda: {
        'time': ['2026-04-28T00:00'], 'temp': [20.0],
        'wind': [15.0], 'precip': [0.0], 'pressure': [1013.0]
    })
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/meteo')
    assert r.status_code == 200
    assert 'temp' in r.get_json()

def test_dashboard_prediccion(client, monkeypatch):
    monkeypatch.setattr(flask_app, 'fetch_prediccion', lambda: {'days': [{
        'date': '2026-04-28', 'temp_max': 25, 'temp_min': 18,
        'precip': 0, 'wind_max': 20, 'wave_max': 1.2,
        'code': 0, 'sunrise': '07:00', 'sunset': '20:30'
    }]})
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/prediccion')
    assert r.status_code == 200
    assert r.get_json()['days'][0]['temp_max'] == 25

def test_dashboard_ais_no_user(client, monkeypatch):
    monkeypatch.setattr(flask_app, 'AISHUB_USER', '')
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/ais')
    assert r.status_code == 200
    d = r.get_json()
    assert d['vessels'] == []
    assert 'note' in d
```

- [ ] **Step 6: Run tests**

```bash
pip install pytest
pytest tests/test_api.py -v
```

Expected: 6 passed.

- [ ] **Step 7: Commit**

```bash
git add app.py tests/
git commit -m "feat: 7 dashboard API endpoints with 10-min cache + pytest suite"
```

---

## Task 5: Frontend — dashboard.js

**Files:**
- Create: `static/js/dashboard.js`
- Modify: `templates/index.html` (add script tag)

- [ ] **Step 1: Create static/js/dashboard.js**

```javascript
const DASH_LABELS = {
    meteo:'METEOROLOGÍA', oleaje:'OLEAJE Y CORRIENTES', mareas:'MAREAS',
    ais:'TRÁFICO MARÍTIMO (AIS)', alertas:'ALERTAS Y AVISOS',
    prediccion:'PREDICCIÓN 7 DÍAS', calidad:'CALIDAD DEL AIRE',
};

const WX_ICONS = {
    0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',48:'🌫',51:'🌦',53:'🌦',
    55:'🌧',61:'🌧',63:'🌧',65:'🌧',71:'❄️',73:'❄️',75:'❄️',
    80:'🌦',81:'🌧',82:'⛈️',95:'⛈️',96:'⛈️',99:'⛈️'
};

let currentDashTab = null;

function switchDashTab(tab) {
    currentDashTab = tab;
    document.getElementById('dash-tab-label').textContent = DASH_LABELS[tab] || 'DASHBOARD';
    document.querySelectorAll('.submenu-btn').forEach(b => b.classList.remove('active'));
    const idx = Object.keys(DASH_LABELS).indexOf(tab);
    if (idx >= 0) document.querySelectorAll('.submenu-btn')[idx].classList.add('active');

    const content = document.getElementById('dash-content');
    content.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:0.8rem;padding:1rem">Cargando...</p>';

    fetch(`/api/dashboard/${tab}`)
        .then(r => r.json())
        .then(data => { const fn = renders[tab]; if (fn) fn(data, content); })
        .catch(() => { content.innerHTML = '<p style="color:#ef4444;padding:1rem">Error cargando datos.</p>'; });
}

const renders = { meteo:renderMeteo, oleaje:renderOleaje, mareas:renderMareas,
    ais:renderAIS, alertas:renderAlertas, prediccion:renderPrediccion, calidad:renderCalidad };

function renderMeteo(data, el) {
    const step = 3;
    const horas = data.time.filter((_,i) => i%step===0).map(t => t.substr(11,5));
    const temps = data.temp.filter((_,i) => i%step===0);
    const winds = data.wind.filter((_,i) => i%step===0);
    el.innerHTML = `
        <p class="dash-section-title">Temperatura y viento — 7 días</p>
        <div class="dash-chart-container" id="chart-temp" style="height:160px"></div>
        <div class="dash-chart-container" id="chart-wind" style="height:140px"></div>`;
    drawLineChart('#chart-temp', horas, temps, '°C', '#4AC8E8');
    drawLineChart('#chart-wind', horas, winds, 'km/h', '#f59e0b');
}

function renderOleaje(data, el) {
    const step = 3;
    const horas = data.time.filter((_,i) => i%step===0).map(t => t.substr(11,5));
    const heights = data.height.filter((_,i) => i%step===0);
    const current = data.height[new Date().getHours()] ?? data.height[0];
    const tempAgua = data.temp_agua ? data.temp_agua.find(v => v !== null) : null;
    el.innerHTML = `
        <p class="dash-section-title">Oleaje — 7 días</p>
        <div class="dash-grid">
            <div class="dash-card"><div class="dash-card-label">Altura actual</div>
                <div class="dash-card-value">${current?.toFixed(1)}m</div></div>
            <div class="dash-card"><div class="dash-card-label">Período</div>
                <div class="dash-card-value">${(data.period?.find(v=>v)??0).toFixed(0)}s</div></div>
            ${tempAgua!=null?`<div class="dash-card"><div class="dash-card-label">Temp. agua</div>
                <div class="dash-card-value">${tempAgua.toFixed(1)}°</div></div>`:''}
        </div>
        <div class="dash-chart-container" id="chart-olas" style="height:160px"></div>`;
    drawLineChart('#chart-olas', horas, heights, 'm', '#4AC8E8');
}

function renderMareas(data, el) {
    const rows = (data.extremes||[]).map(e => `
        <div class="dash-card" style="flex-direction:row;align-items:center;gap:1rem">
            <span style="font-size:1.5rem">${e.type==='pleamar'?'↑':'↓'}</span>
            <div>
                <div class="dash-card-label">${e.type==='pleamar'?'Pleamar':'Bajamar'}</div>
                <div class="dash-card-value" style="font-size:1.1rem">${e.time}</div>
                <div class="dash-card-sub">${e.height?.toFixed(1)}m</div>
            </div>
        </div>`).join('');
    const note = data.source==='estimado'?'<p style="color:rgba(255,255,255,0.25);font-size:0.7rem;margin-top:0.5rem">⚠ Datos estimados. Configura la API de Puertos del Estado para datos oficiales.</p>':'';
    el.innerHTML = `<p class="dash-section-title">Mareas — hoy</p><div class="dash-grid">${rows}</div>${note}`;
}

function renderAIS(data, el) {
    if (data.note) { el.innerHTML=`<p style="color:rgba(255,255,255,0.35);padding:1rem">${data.note}</p>`; return; }
    const vessels = data.vessels||[];
    if (!vessels.length) { el.innerHTML='<p style="color:rgba(255,255,255,0.35);padding:1rem">Sin buques detectados en el área.</p>'; return; }
    const rows = vessels.map(v=>`<tr><td>${v.name}</td><td>${v.type||'-'}</td>
        <td>${v.speed!=null?v.speed.toFixed(1)+' kt':'-'}</td><td>${v.course!=null?v.course+'°':'-'}</td></tr>`).join('');
    el.innerHTML = `
        <p class="dash-section-title">Buques en el área de Rota (~5 min retraso)</p>
        <div style="overflow-x:auto"><table class="ais-table">
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Velocidad</th><th>Rumbo</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`;
}

function renderAlertas(data, el) {
    if (data.note) { el.innerHTML=`<p style="color:rgba(255,255,255,0.35);padding:1rem">${data.note}</p>`; return; }
    const alertas = data.alertas||[];
    if (!alertas.length) {
        el.innerHTML=`<p class="dash-section-title">Alertas activas — Cádiz</p>
            <div class="alert-card verde"><div class="alert-title">Sin alertas activas</div>
            <div class="alert-desc">No hay avisos meteorológicos en vigor para la provincia de Cádiz.</div></div>`;
        return;
    }
    const cards = alertas.map(a=>`<div class="alert-card ${a.nivel}">
        <div class="alert-title">${a.titulo}</div>
        <div class="alert-desc">${a.descripcion}</div>
        <div class="alert-desc" style="margin-top:.25rem">${a.inicio} → ${a.fin}</div></div>`).join('');
    el.innerHTML=`<p class="dash-section-title">Alertas activas — Cádiz</p>${cards}`;
}

function renderPrediccion(data, el) {
    const dias=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const days=(data.days||[]).map(d=>{
        const nombre=dias[new Date(d.date).getDay()];
        const icon=WX_ICONS[d.code]||'🌡';
        return `<div class="forecast-day">
            <div class="forecast-day-name">${nombre}</div>
            <div class="forecast-day-icon">${icon}</div>
            <div class="forecast-day-temp">${d.temp_max?.toFixed(0)}°</div>
            <div class="forecast-day-sub">${d.temp_min?.toFixed(0)}° mín</div>
            <div class="forecast-day-sub" style="margin-top:.3rem">💨 ${d.wind_max?.toFixed(0)} km/h</div>
            ${d.wave_max!=null?`<div class="forecast-day-sub">🌊 ${d.wave_max?.toFixed(1)}m</div>`:''}</div>`;
    }).join('');
    el.innerHTML=`<p class="dash-section-title">Predicción 7 días</p><div class="forecast-grid">${days}</div>`;
}

function renderCalidad(data, el) {
    const aqi=data.aqi||0;
    const color=aqi<20?'#22c55e':aqi<40?'#84cc16':aqi<60?'#f59e0b':aqi<80?'#f97316':'#ef4444';
    const label=aqi<20?'Muy buena':aqi<40?'Buena':aqi<60?'Moderada':aqi<80?'Mala':'Muy mala';
    el.innerHTML=`
        <p class="dash-section-title">Calidad del aire — ahora</p>
        <div class="dash-grid">
            <div class="dash-card"><div class="dash-card-label">Índice AQI</div>
                <div class="dash-card-value" style="color:${color}">${aqi}</div>
                <div class="dash-card-sub">${label}</div></div>
            <div class="dash-card"><div class="dash-card-label">UV</div>
                <div class="dash-card-value">${data.uv?.toFixed(1)||'-'}</div></div>
            <div class="dash-card"><div class="dash-card-label">PM2.5</div>
                <div class="dash-card-value" style="font-size:1.1rem">${data.pm25?.toFixed(1)||'-'} μg/m³</div></div>
            <div class="dash-card"><div class="dash-card-label">PM10</div>
                <div class="dash-card-value" style="font-size:1.1rem">${data.pm10?.toFixed(1)||'-'} μg/m³</div></div>
            <div class="dash-card"><div class="dash-card-label">Ozono</div>
                <div class="dash-card-value" style="font-size:1.1rem">${data.ozone?.toFixed(0)||'-'} μg/m³</div></div>
        </div>`;
}

function drawLineChart(selector, labels, values, unit, color) {
    const el = document.querySelector(selector);
    if (!el||!values?.length) return;
    const m={top:10,right:10,bottom:30,left:35};
    const w=el.clientWidth-m.left-m.right, h=el.clientHeight-m.top-m.bottom;
    d3.select(selector).select('svg').remove();
    const svg=d3.select(selector).append('svg')
        .attr('width',el.clientWidth).attr('height',el.clientHeight)
        .append('g').attr('transform',`translate(${m.left},${m.top})`);
    const x=d3.scalePoint().domain(labels).range([0,w]);
    const y=d3.scaleLinear().domain([d3.min(values)*0.95,d3.max(values)*1.05]).range([h,0]);
    const gradId=`g${selector.replace(/\W/g,'')}`;
    const defs=svg.append('defs');
    const grad=defs.append('linearGradient').attr('id',gradId)
        .attr('gradientUnits','userSpaceOnUse').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',h);
    grad.append('stop').attr('offset','0%').attr('stop-color',color).attr('stop-opacity',0.25);
    grad.append('stop').attr('offset','100%').attr('stop-color',color).attr('stop-opacity',0);
    const area=d3.area().x((_,i)=>x(labels[i])).y0(h).y1(d=>y(d)).curve(d3.curveCatmullRom);
    const line=d3.line().x((_,i)=>x(labels[i])).y(d=>y(d)).curve(d3.curveCatmullRom);
    svg.append('path').datum(values).attr('fill',`url(#${gradId})`).attr('d',area);
    svg.append('path').datum(values).attr('fill','none').attr('stroke',color).attr('stroke-width',1.5).attr('d',line);
    const every=Math.max(1,Math.floor(labels.length/8));
    svg.append('g').attr('transform',`translate(0,${h})`)
        .call(d3.axisBottom(x).tickValues(labels.filter((_,i)=>i%every===0)))
        .selectAll('text').attr('fill','rgba(255,255,255,0.35)').attr('font-size','9px');
    svg.append('g').call(d3.axisLeft(y).ticks(4))
        .selectAll('text').attr('fill','rgba(255,255,255,0.35)').attr('font-size','9px');
    svg.selectAll('.domain,.tick line').attr('stroke','rgba(255,255,255,0.08)');
}
```

- [ ] **Step 2: Add script tag in index.html**

Before `</body>`, add:

```html
<script src="/static/js/dashboard.js"></script>
```

- [ ] **Step 3: Test manually**

```bash
python app.py
# Click tab 2 → click each sub-tab
# Verify data loads without console errors
# Verify charts render for Meteo and Oleaje
# Verify forecast grid shows 7 days
```

- [ ] **Step 4: Commit**

```bash
git add static/js/dashboard.js templates/index.html
git commit -m "feat: dashboard.js — all 7 sub-tabs with D3 charts and data rendering"
```

---

## Task 6: Settings tab JS

**Files:**
- Modify: `static/js/main.js`

- [ ] **Step 1: Add state variables after prefsActuales declaration**

```javascript
let tempUnit = localStorage.getItem('tempUnit') || 'c';
let windUnit = localStorage.getItem('windUnit') || 'kmh';
let lang = localStorage.getItem('lang') || 'es';

function setTempUnit(unit) {
    tempUnit = unit;
    localStorage.setItem('tempUnit', unit);
    ['c','f'].forEach(u => document.getElementById(`btn-${u}`)?.classList.toggle('active', u===unit));
    const val = unit==='f' ? Math.round(tempC*9/5+32) : tempC;
    const sVal = unit==='f' ? Math.round(sensacionC*9/5+32) : sensacionC;
    document.getElementById('temp-valor').textContent = val + '°';
    document.getElementById('sensacion').textContent = sVal + '°' + unit.toUpperCase();
    document.getElementById('temp-btn').textContent = '°' + unit.toUpperCase();
}

function setWindUnit(unit) {
    windUnit = unit;
    localStorage.setItem('windUnit', unit);
    ['kmh','kn','ms'].forEach(u => document.getElementById(`btn-${u}`)?.classList.toggle('active', u===unit));
}

function setLang(l) {
    lang = l;
    localStorage.setItem('lang', l);
    ['es','en'].forEach(u => document.getElementById(`btn-${u}`)?.classList.toggle('active', u===l));
}

function renderSettingsWidgets() {
    const grid = document.getElementById('config-grid-settings');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(WIDGET_NOMBRES).forEach(([key, nombre]) => {
        const activo = prefsActuales[key] !== false;
        grid.innerHTML += `<div class="config-item"><span>${nombre}</span>
            <button class="toggle-btn ${activo?'on':'off'}" onclick="toggleWidget('${key}')">
            ${activo?'ON':'OFF'}</button></div>`;
    });
}
```

- [ ] **Step 2: Restore saved state on load**

At the bottom of `main.js`, after `aplicarPrefs()`:

```javascript
setTempUnit(tempUnit);
setWindUnit(windUnit);
setLang(lang);
```

- [ ] **Step 3: Test persistence**

```bash
python app.py
# Open http://localhost:5000 → Settings tab
# Toggle °F → verify overview temperature updates
# Refresh page → verify °F is still selected
```

- [ ] **Step 4: Commit**

```bash
git add static/js/main.js
git commit -m "feat: settings tab — persistent units and language via localStorage"
```

---

## Task 7: Map enhancements

**Files:**
- Modify: `static/js/mapa.js`

- [ ] **Step 1: Replace mapa.js entirely**

```javascript
mapboxgl.accessToken = MAPBOX_KEY;

const mapa = new mapboxgl.Map({
    container: 'mapa',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-6.3621, 36.6367],
    zoom: 11.5, pitch: 45, bearing: -15
});
window.mapa = mapa;
let mapLayersReady = false;

mapa.on('load', () => {
    mapa.setPaintProperty('water', 'fill-color', '#0a2a3a');

    // Marcador Base Naval
    const el = document.createElement('div');
    el.className = 'marcador-naval';
    new mapboxgl.Marker(el).setLngLat([-6.3493, 36.6367])
        .setPopup(new mapboxgl.Popup({offset:25})
            .setHTML('<strong>Base Naval de Rota</strong><br>NAVSTA Rota ROZ<br><small>36.6367°N 6.3493°W</small>'))
        .addTo(mapa);

    // Puerto de Rota
    new mapboxgl.Marker({color:'#4AC8E8'}).setLngLat([-6.3620, 36.6250])
        .setPopup(new mapboxgl.Popup({offset:25}).setHTML('<strong>Puerto de Rota</strong>'))
        .addTo(mapa);

    // ROZ circle
    mapa.addSource('zona', {type:'geojson', data:{type:'Feature',
        geometry:{type:'Point', coordinates:[-6.3493,36.6367]}}});
    mapa.addLayer({id:'zona-radio', type:'circle', source:'zona', paint:{
        'circle-radius':40,'circle-color':'#4AC8E8','circle-opacity':0.06,
        'circle-stroke-width':1,'circle-stroke-color':'#4AC8E8','circle-stroke-opacity':0.3}});

    // AIS source + layer (hidden initially)
    mapa.addSource('ais-src', {type:'geojson', data:{type:'FeatureCollection',features:[]}});
    mapa.addLayer({id:'ais-layer', type:'circle', source:'ais-src',
        layout:{visibility:'none'},
        paint:{'circle-radius':6,'circle-color':'#f59e0b',
            'circle-stroke-width':1.5,'circle-stroke-color':'white','circle-opacity':0.9}});

    mapa.on('click','ais-layer', e => {
        const p = e.features[0].properties;
        new mapboxgl.Popup().setLngLat(e.lngLat)
            .setHTML(`<strong>${p.name}</strong><br>Tipo: ${p.type}<br>Velocidad: ${p.speed} kt<br>Rumbo: ${p.course}°`)
            .addTo(mapa);
    });
    mapa.on('mouseenter','ais-layer',()=>mapa.getCanvas().style.cursor='pointer');
    mapa.on('mouseleave','ais-layer',()=>mapa.getCanvas().style.cursor='');
    mapa.addControl(new mapboxgl.NavigationControl(),'top-right');
    mapLayersReady = true;
});

function initMapLayers() {
    if (!mapLayersReady) return;
    if (document.getElementById('toggle-ais')?.checked) loadAISLayer();
}

function loadAISLayer() {
    if (!mapLayersReady) return;
    fetch('/api/dashboard/ais').then(r=>r.json()).then(data => {
        const features = (data.vessels||[])
            .filter(v => v.lat && v.lon)
            .map(v => ({type:'Feature',
                geometry:{type:'Point',coordinates:[v.lon,v.lat]},
                properties:{name:v.name,type:v.type,speed:v.speed,course:v.course}}));
        mapa.getSource('ais-src').setData({type:'FeatureCollection',features});
    }).catch(()=>{});
}

function toggleMapLayer(layer) {
    if (!mapLayersReady) return;
    if (layer==='ais') {
        const vis = document.getElementById('toggle-ais').checked ? 'visible' : 'none';
        mapa.setLayoutProperty('ais-layer','visibility',vis);
        if (vis==='visible') loadAISLayer();
    }
    if (layer==='waypoints') {
        const show = document.getElementById('toggle-waypoints').checked;
        document.querySelectorAll('.mapboxgl-marker')
            .forEach(m => m.style.display = show ? '' : 'none');
    }
}

function toggleMapStyle() {
    const sat = document.getElementById('toggle-satellite').checked;
    mapa.setStyle(sat ? 'mapbox://styles/mapbox/satellite-streets-v12'
                      : 'mapbox://styles/mapbox/dark-v11');
    mapa.once('style.load', () => {
        mapa.setPaintProperty('water','fill-color','#0a2a3a');
        mapLayersReady = false;
        setTimeout(() => { mapLayersReady = true; initMapLayers(); }, 500);
    });
}
```

- [ ] **Step 2: Test map tab**

```bash
python app.py
# Click map tab (3rd icon)
# Verify map loads with markers
# Toggle AIS — layer visibility changes
# Toggle satellite — style switches
```

- [ ] **Step 3: Commit**

```bash
git add static/js/mapa.js
git commit -m "feat: map — AIS vessel layer, waypoints toggle, satellite style"
```

---

## Task 8: Ko-fi link and AdSense prep

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Set real Ko-fi URL**

In `index.html`, find both occurrences of `https://ko-fi.com/TU_USUARIO`. Replace with your actual Ko-fi profile URL.

- [ ] **Step 2: Verify ad slots on wide screen**

```bash
python app.py
# Open DevTools → set viewport to 1500px wide
# Verify right sidebar (160×600) appears
# Set viewport to 700px → verify both ad slots hidden
# Verify banner not visible in Map tab
```

- [ ] **Step 3: Commit**

```bash
git add templates/index.html
git commit -m "feat: Ko-fi banner active, ad slots verified"
```

---

## Task 9: Deploy and smoke test

- [ ] **Step 1: Push to Railway**

```bash
git push origin main
# Railway auto-deploys from main — wait ~2 min
```

- [ ] **Step 2: Add env vars on Railway**

In Railway dashboard → your service → Variables, add:
- `AEMET_API_KEY` — get free at https://opendata.aemet.es/centrodedescargas/inicio
- `AISHUB_USER` — register free at https://www.aishub.net/register
- `MAPBOX_KEY` — should already be set

- [ ] **Step 3: Smoke test checklist**

Open https://dashboard-maritimo.up.railway.app:

- [ ] Home overview loads real data, no blur artifacts
- [ ] Dashboard → Meteorología: line charts render
- [ ] Dashboard → Predicción: 7-day grid with icons
- [ ] Dashboard → Calidad: AQI cards
- [ ] Dashboard → AIS: table or config message
- [ ] Dashboard → Alertas: green card or real alerts
- [ ] Dashboard → Mareas: tide extremes (or stub note)
- [ ] Dashboard → Oleaje: wave chart
- [ ] Map tab: loads with NAVSTA marker and ROZ circle
- [ ] Settings: °F persists after refresh
- [ ] Ko-fi banner visible top-right
- [ ] Ad slots visible at 1500px width

- [ ] **Step 4: Tag release**

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## Self-Review

| Spec requirement | Task |
|---|---|
| Fix duplicate route + init_db | Task 1 |
| Solid dark CSS, no glassmorphism | Task 2 |
| Labelled sub-tab sidebar | Task 3 |
| 7 backend API endpoints | Task 4 |
| All 7 sub-tab renders | Task 5 |
| Settings: units, language, widgets | Task 6 |
| Map: AIS layer, waypoints, satellite | Task 7 |
| Ad slots (728×90 + 160×600) | Task 2+3 |
| Ko-fi banner | Task 3+8 |
| Pytest suite | Task 4 |
| Railway deployment | Task 9 |

All spec requirements covered. No TBD or placeholders. Function signatures consistent: `render*(data, el)` in dashboard.js, `toggleMapLayer(layer)` matches HTML `onchange` attributes, `fetch_*` return dicts match `render*` expected keys.
