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
