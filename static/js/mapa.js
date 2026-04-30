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

    // ROZ Rota: 5nm radius circle polygon (1nm ≈ 1852m)
    const rozCenter = [-6.3493, 36.6367];
    const rozRadiusNm = 5;
    const rozRadiusDeg = rozRadiusNm * 1852 / 111320;
    const rozPoints = Array.from({length: 64}, (_, i) => {
        const angle = (i / 64) * 2 * Math.PI;
        return [
            rozCenter[0] + rozRadiusDeg * Math.cos(angle) / Math.cos(rozCenter[1] * Math.PI / 180),
            rozCenter[1] + rozRadiusDeg * Math.sin(angle)
        ];
    });
    rozPoints.push(rozPoints[0]);  // close ring
    mapa.addSource('zona', {type:'geojson', data:{type:'Feature',
        geometry:{type:'Polygon', coordinates:[rozPoints]}}});
    mapa.addLayer({id:'zona-radio-fill', type:'fill', source:'zona',
        layout:{visibility:'visible'},
        paint:{'fill-color':'#ef4444','fill-opacity':0.06}});
    mapa.addLayer({id:'zona-radio', type:'line', source:'zona',
        layout:{visibility:'visible'},
        paint:{'line-color':'#ef4444','line-width':1.5,'line-opacity':0.5,'line-dasharray':[4,2]}});

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
        const vis = document.getElementById('toggle-ais')?.checked ? 'visible' : 'none';
        mapa.setLayoutProperty('ais-layer','visibility',vis);
        if (vis==='visible') loadAISLayer();
    }
    if (layer==='waypoints') {
        const show = document.getElementById('toggle-waypoints')?.checked;
        document.querySelectorAll('.mapboxgl-marker')
            .forEach(m => m.style.display = show ? '' : 'none');
    }
    if (layer==='roz') {
        const vis = document.getElementById('toggle-roz')?.checked ? 'visible' : 'none';
        ['zona-radio-fill','zona-radio'].forEach(id => {
            if (mapa.getLayer(id)) mapa.setLayoutProperty(id,'visibility',vis);
        });
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
