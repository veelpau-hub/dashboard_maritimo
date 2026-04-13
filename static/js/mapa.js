mapboxgl.accessToken = MAPBOX_KEY;

const mapa = new mapboxgl.Map({
    container: 'mapa',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-6.3621, 36.6367],
    zoom: 11.5,
    pitch: 45,
    bearing: -15
});

mapa.on('load', () => {
    // agua más oscura y azulada
    mapa.setPaintProperty('water', 'fill-color', '#0a2a3a');

    // marcador Base Naval
    const el = document.createElement('div');
    el.className = 'marcador-naval';

    new mapboxgl.Marker(el)
        .setLngLat([-6.3493, 36.6367])
        .setPopup(new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
                <strong>Base Naval de Rota</strong><br>
                NAVSTA Rota ROZ<br>
                <small>36.6367°N 6.3493°W</small>
            `))
        .addTo(mapa);

    // círculo de zona de operaciones
    mapa.addSource('zona', {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [-6.3493, 36.6367]
            }
        }
    });

    mapa.addLayer({
        id: 'zona-radio',
        type: 'circle',
        source: 'zona',
        paint: {
            'circle-radius': 40,
            'circle-color': '#4AC8E8',
            'circle-opacity': 0.08,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#4AC8E8',
            'circle-stroke-opacity': 0.3
        }
    });

    mapa.addControl(new mapboxgl.NavigationControl(), 'top-right');
});