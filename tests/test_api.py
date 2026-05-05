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

def test_waypoints_crud(client):
    # Create
    r = client.post('/api/waypoints', json={
        'nombre': 'Zona pesca test',
        'lat': 36.62, 'lon': -6.35,
        'descripcion': 'Test waypoint'
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data['ok'] is True
    assert 'id' in data
    wp_id = data['id']

    # List
    r2 = client.get('/api/waypoints')
    assert r2.status_code == 200
    wps = r2.get_json()['waypoints']
    assert any(w['id'] == wp_id for w in wps)

    # Delete
    r3 = client.delete(f'/api/waypoints/{wp_id}')
    assert r3.status_code == 200
    assert r3.get_json()['ok'] is True

def test_waypoints_invalid_coords(client):
    r = client.post('/api/waypoints', json={'nombre': 'Bad', 'lat': 999, 'lon': -6.35})
    assert r.status_code == 400

def test_capturas_crud(client):
    # Create
    r = client.post('/api/capturas', json={
        'especie': 'Dorada',
        'peso_kg': 1.5,
        'longitud_cm': 35,
        'notas': 'Test captura',
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data['ok'] is True
    assert 'id' in data
    cap_id = data['id']

    # List
    r2 = client.get('/api/capturas')
    assert r2.status_code == 200
    d2 = r2.get_json()
    assert 'capturas' in d2 and 'stats' in d2
    assert any(c['id'] == cap_id for c in d2['capturas'])
    assert 'Dorada' in d2['stats']
    assert d2['stats']['Dorada']['count'] >= 1

    # Delete
    r3 = client.delete(f'/api/capturas/{cap_id}')
    assert r3.status_code == 200
    assert r3.get_json()['ok'] is True

def test_vigilancia_log(client):
    r = client.get('/api/vigilancia_log')
    assert r.status_code == 200
    d = r.get_json()
    assert 'log' in d

def test_routing_endpoint(client, monkeypatch):
    """Test the routing endpoint returns expected structure."""
    import app as flask_app
    # Mock fetch_routing to avoid real API calls
    monkeypatch.setattr(flask_app, 'fetch_routing', lambda lat1, lon1, lat2, lon2: {
        'from': {'lat': lat1, 'lon': lon1},
        'to': {'lat': lat2, 'lon': lon2},
        'distance_km': 15.0,
        'points': [],
        'best_departure': '09:00',
    })
    r = client.get('/api/routing?lat1=36.62&lon1=-6.35&lat2=36.72&lon2=-6.20')
    assert r.status_code == 200
    d = r.get_json()
    assert 'distance_km' in d
    assert 'from' in d and 'to' in d

def test_dashboard_manana(client, monkeypatch):
    import app as flask_app
    mock_manana = lambda: {
        'hours': [{'time': '10:00', 'wind': 10.0, 'gusts': 15.0,
                   'wave_h': 0.5, 'wave_p': 6.0, 'precip': 0.0,
                   'code': 0, 'score': 9, 'color': '#22c55e'}],
        'date': '2026-05-02',
    }
    monkeypatch.setitem(flask_app._DASH_FETCHERS, 'manana', mock_manana)
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/manana')
    assert r.status_code == 200
    d = r.get_json()
    assert 'hours' in d
    assert len(d['hours']) == 1

def test_ais_status(client):
    r = client.get('/api/ais_status')
    assert r.status_code == 200
    d = r.get_json()
    assert 'connected' in d and 'vessel_count' in d

def test_mareas_estado(client, monkeypatch):
    import app as flask_app
    monkeypatch.setattr(flask_app, 'fetch_mareas', lambda: {
        'extremes': [
            {'type': 'bajamar', 'time': '06:30', 'height': 0.4},
            {'type': 'pleamar', 'time': '12:45', 'height': 2.8},
            {'type': 'bajamar', 'time': '19:10', 'height': 0.5},
        ],
        'coeficiente': 85,
    })
    flask_app._dash_cache.clear()
    r = client.get('/api/mareas_estado')
    assert r.status_code == 200
    d = r.get_json()
    assert 'estado' in d
    assert d['estado'] in ('entrante', 'saliente', 'parada', 'desconocido')

def test_briefing_endpoint(client):
    r = client.get('/api/briefing')
    assert r.status_code == 200
    d = r.get_json()
    assert 'briefing' in d or 'error' in d

def test_puertos_cercanos(client):
    r = client.get('/api/puertos_cercanos?lat=36.62&lon=-6.35')
    assert r.status_code == 200
    d = r.get_json()
    assert 'puertos' in d
    assert len(d['puertos']) <= 5
    # Rota should be the closest
    assert d['puertos'][0]['name'] == 'Rota'

def test_puertos_cercanos_missing_params(client):
    r = client.get('/api/puertos_cercanos')
    assert r.status_code == 400

def test_score_dia(client):
    r = client.get('/api/score_dia')
    assert r.status_code == 200
    d = r.get_json()
    assert 'score' in d
    assert 0 <= d['score'] <= 100
    assert 'label' in d and 'color' in d

def test_vigilancia_interceptacion_field(client, monkeypatch):
    import ais_stream
    monkeypatch.setattr(ais_stream, 'get_vessels', lambda: [])
    import app as flask_app
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/vigilancia')
    assert r.status_code == 200
    d = r.get_json()
    assert 'interceptacion' in d
    assert d['interceptacion'] == 0

def test_buques_aprobados_crud(client):
    # Add
    r = client.post('/api/buques_aprobados', json={
        'mmsi': '123456789', 'nombre': 'Test Ship', 'motivo': 'Pesquero local conocido'
    })
    assert r.status_code == 200
    assert r.get_json()['ok'] is True

    # List
    r2 = client.get('/api/buques_aprobados')
    assert r2.status_code == 200
    d = r2.get_json()
    assert any(b['mmsi'] == '123456789' for b in d['buques'])

    # Delete
    r3 = client.delete('/api/buques_aprobados/123456789')
    assert r3.status_code == 200
    assert r3.get_json()['ok'] is True

def test_buques_aprobados_missing_mmsi(client):
    r = client.post('/api/buques_aprobados', json={'nombre': 'No MMSI'})
    assert r.status_code == 400

def test_pesca_best_hours_detail(client, monkeypatch):
    """Test that best_hours_detail is present and has nota field."""
    import app as flask_app
    monkeypatch.setattr(flask_app, 'get_datos_maritimos', lambda: {
        'altura_max': 0.5, 'viento_kmh': 10, 'visibilidad': 10,
        'presion': 1013, 'sunrise': '07:00', 'sunset': '20:00', 'temp_agua': 18.5,
        'temperatura_c': 22.0, 'sensacion_c': 21.0,
    })
    monkeypatch.setattr(flask_app, 'fetch_mareas', lambda: {
        'extremes': [{'type': 'bajamar', 'time': '06:30', 'height': 0.4},
                     {'type': 'pleamar', 'time': '12:45', 'height': 2.8}]
    })
    monkeypatch.setattr(flask_app, 'fetch_oleaje', lambda: {
        'time': [], 'height': [], 'direction': [], 'period': [], 'temp_agua': [18.5]*168,
    })
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/pesca')
    assert r.status_code == 200
    d = r.get_json()
    assert 'best_hours_detail' in d
    if d['best_hours_detail']:
        assert 'hora' in d['best_hours_detail'][0]
        assert 'nota' in d['best_hours_detail'][0]

def test_historial_condiciones_endpoint(client):
    r = client.get('/api/historial_condiciones')
    assert r.status_code == 200
    d = r.get_json()
    assert 'dias' in d

def test_historial_condiciones_limit(client):
    r = client.get('/api/historial_condiciones?days=7')
    assert r.status_code == 200
    d = r.get_json()
    assert len(d['dias']) <= 7

def test_dashboard_historial(client, monkeypatch):
    import app as flask_app
    monkeypatch.setitem(flask_app._DASH_FETCHERS, 'historial', lambda: {'dias': [], 'total': 0})
    flask_app._dash_cache.clear()
    r = client.get('/api/dashboard/historial')
    assert r.status_code == 200
    d = r.get_json()
    assert 'dias' in d

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
