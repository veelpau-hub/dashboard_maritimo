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
    mock = lambda: {'days': [{'date': '2026-04-28', 'temp_max': 25, 'temp_min': 18,
        'precip': 0, 'wind_max': 20, 'wave_max': None,
        'code': 0, 'sunrise': '07:00', 'sunset': '20:30'}]}
    monkeypatch.setitem(flask_app._DASH_FETCHERS, 'prediccion', mock)
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/prediccion')
    assert r.status_code == 200
    assert r.get_json()['days'][0]['temp_max'] == 25

def test_dashboard_ais(client, monkeypatch):
    import ais_stream
    monkeypatch.setattr(ais_stream, 'get_vessels', lambda: [])
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/ais')
    assert r.status_code == 200
    d = r.get_json()
    assert d['vessels'] == []
    assert 'count' in d

def test_dashboard_vigilancia(client, monkeypatch):
    import ais_stream
    monkeypatch.setattr(ais_stream, 'get_vessels', lambda: [])
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/vigilancia')
    assert r.status_code == 200
    d = r.get_json()
    assert 'vessels' in d
    assert 'roz' in d
    assert 'total' in d

def test_dashboard_pesca(client, monkeypatch):
    # Mock underlying data sources
    monkeypatch.setattr(flask_app, 'get_datos_maritimos', lambda: {
        'altura_max': 0.5, 'viento_kmh': 10, 'visibilidad': 10,
        'presion': 1013, 'sunrise': '07:00', 'sunset': '20:00', 'temp_agua': 18.5,
        'temperatura_c': 22.0, 'sensacion_c': 21.0,
    })
    # Stub out the fetch functions called inside fetch_pesca
    monkeypatch.setattr(flask_app, 'fetch_mareas', lambda: {
        'extremes': [{'type':'bajamar','time':'06:30','height':0.4},
                     {'type':'pleamar','time':'12:45','height':2.8}]
    })
    monkeypatch.setattr(flask_app, 'fetch_oleaje', lambda: {
        'time': [], 'height': [], 'direction': [], 'period': [],
        'temp_agua': [18.5]*168,
    })
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/pesca')
    assert r.status_code == 200
    d = r.get_json()
    assert 'fishing_index' in d
    assert 'go_nogo' in d
    assert 'moon' in d
    assert 'species_in_season' in d
