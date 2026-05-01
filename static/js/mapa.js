mapboxgl.accessToken = MAPBOX_KEY;

const mapa = new mapboxgl.Map({
    container: 'mapa',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-6.3621, 36.6367],
    zoom: 11.5, pitch: 45, bearing: -15
});
window.mapa = mapa;
let mapLayersReady = false;

// =================== WIND PARTICLE ANIMATION ===================
let windCanvas = null, windCtx = null, windAnim = null;
let windActive = false;
let windParticles = [];
const WIND_PARTICLE_COUNT = 180;
let windSpeed = 0, windDirDeg = 0;  // populated from datos

function initWindCanvas() {
    const mapContainer = document.getElementById('mapa');
    if (!mapContainer) return;
    windCanvas = document.createElement('canvas');
    windCanvas.id = 'wind-canvas';
    windCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;opacity:0.65';
    windCanvas.width = mapContainer.offsetWidth;
    windCanvas.height = mapContainer.offsetHeight;
    mapContainer.appendChild(windCanvas);
    windCtx = windCanvas.getContext('2d');
    // Init particles
    for (let i = 0; i < WIND_PARTICLE_COUNT; i++) {
        windParticles.push({
            x: Math.random() * windCanvas.width,
            y: Math.random() * windCanvas.height,
            age: Math.random() * 60,
            maxAge: 40 + Math.random() * 60,
        });
    }
}

function animateWind() {
    if (!windCtx || !windActive) return;
    const W = windCanvas.width, H = windCanvas.height;
    // Fade trail
    windCtx.fillStyle = 'rgba(10,15,30,0.18)';
    windCtx.fillRect(0, 0, W, H);
    // Convert wind direction (meteorological: from N clockwise) to canvas vector
    const rad = (windDirDeg + 180) * Math.PI / 180;
    const speedFactor = Math.min(6, windSpeed / 8);  // cap speed
    const vx = Math.sin(rad) * speedFactor;
    const vy = -Math.cos(rad) * speedFactor;  // canvas Y is inverted
    // Color based on speed
    const hue = windSpeed < 15 ? 180 : windSpeed < 25 ? 40 : 0;
    windCtx.strokeStyle = `hsla(${hue},90%,70%,0.7)`;
    windCtx.lineWidth = 1;
    windParticles.forEach(p => {
        windCtx.beginPath();
        windCtx.moveTo(p.x, p.y);
        p.x += vx + (Math.random() - 0.5) * 0.5;
        p.y += vy + (Math.random() - 0.5) * 0.5;
        windCtx.lineTo(p.x, p.y);
        windCtx.stroke();
        p.age++;
        // Reset when out of bounds or aged out
        if (p.age > p.maxAge || p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
            p.x = Math.random() * W;
            p.y = Math.random() * H;
            p.age = 0;
            p.maxAge = 40 + Math.random() * 60;
        }
    });
    windAnim = requestAnimationFrame(animateWind);
}

function toggleWindAnimation() {
    windActive = document.getElementById('toggle-wind')?.checked || false;
    if (!windCanvas) initWindCanvas();
    if (windActive) {
        windCanvas.style.display = 'block';
        animateWind();
    } else {
        cancelAnimationFrame(windAnim);
        windCanvas.style.display = 'none';
    }
}

// =================== AIS HISTORY ===================
let aisHistoryData = {};  // mmsi -> [{lat,lon,ts}]

// =================== MAP INIT ===================
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

    // AIS history trail source
    mapa.addSource('ais-trail-src', {type:'geojson', data:{type:'FeatureCollection',features:[]}});
    mapa.addLayer({id:'ais-trail', type:'line', source:'ais-trail-src',
        layout:{visibility:'none'},
        paint:{'line-color':'#f59e0b','line-width':1.5,'line-opacity':0.5,
            'line-dasharray':[2,2]}});

    mapa.on('click','ais-layer', e => {
        const p = e.features[0].properties;
        const mmsi = p.mmsi;
        const hist = aisHistoryData[mmsi] || [];
        // Show trail on click
        if (hist.length > 1) {
            const coords = hist.map(h => [h.lon, h.lat]);
            mapa.getSource('ais-trail-src').setData({type:'FeatureCollection', features:[{
                type:'Feature', geometry:{type:'LineString', coordinates:coords}
            }]});
            mapa.setLayoutProperty('ais-trail','visibility','visible');
        }
        // Sanitize for popup display (no innerHTML injection)
        const safeName = String(p.name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeType = String(p.type||'-').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeSpeed = p.speed != null ? parseFloat(p.speed).toFixed(1) + ' kt' : '-';
        const safeCourse = p.course != null ? parseFloat(p.course).toFixed(0) + '°' : '-';
        const safeMmsi = String(mmsi||'').replace(/[^0-9]/g,'');
        new mapboxgl.Popup().setLngLat(e.lngLat)
            .setHTML(`<strong>${safeName}</strong><br>Tipo: ${safeType}<br>Vel: ${safeSpeed} | Rumbo: ${safeCourse}<br>
                <a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${safeMmsi}" target="_blank" style="color:#4AC8E8">Ver en MarineTraffic</a>`)
            .addTo(mapa);
    });
    mapa.on('mouseenter','ais-layer',()=>mapa.getCanvas().style.cursor='pointer');
    mapa.on('mouseleave','ais-layer',()=>mapa.getCanvas().style.cursor='');

    // Coordinate display on hover
    const coordDisplay = document.createElement('div');
    coordDisplay.id = 'map-coords';
    coordDisplay.style.cssText = 'position:absolute;bottom:8px;right:8px;background:rgba(13,21,32,0.85);color:rgba(255,255,255,0.5);font-size:0.65rem;padding:3px 8px;border-radius:5px;pointer-events:none;z-index:10';
    document.getElementById('panel-mapa').appendChild(coordDisplay);
    mapa.on('mousemove', e => {
        coordDisplay.textContent = `${e.lngLat.lat.toFixed(4)}°N  ${Math.abs(e.lngLat.lng).toFixed(4)}°W`;
    });

    mapa.addControl(new mapboxgl.NavigationControl(),'top-right');
    mapLayersReady = true;

    // Set wind params from page data if available
    if (typeof vientoGrados !== 'undefined') windDirDeg = vientoGrados;
    if (typeof window.vientoKmh !== 'undefined') windSpeed = window.vientoKmh;
});

function initMapLayers() {
    if (!mapLayersReady) return;
    if (document.getElementById('toggle-ais')?.checked) loadAISLayer();
}

function loadAISLayer() {
    if (!mapLayersReady) return;
    fetch('/api/dashboard/vigilancia').then(r=>r.json()).then(data => {
        const vessels = data.vessels || [];
        const features = vessels
            .filter(v => v.lat && v.lon)
            .map(v => ({type:'Feature',
                geometry:{type:'Point',coordinates:[v.lon,v.lat]},
                properties:{
                    name:v.name, type:v.type, speed:v.speed,
                    course:v.course, mmsi:v.mmsi,
                    amenaza:v.amenaza
                }}));
        mapa.getSource('ais-src').setData({type:'FeatureCollection',features});
        // Store history for trail display
        vessels.forEach(v => {
            if (v.mmsi && v.history) aisHistoryData[v.mmsi] = v.history;
        });
        // Color by threat level
        mapa.setPaintProperty('ais-layer','circle-color',[
            'match', ['get','amenaza'],
            'ROJO','#ef4444',
            'AMARILLO','#f59e0b',
            'VERDE','#22c55e',
            '#f59e0b'
        ]);
    }).catch(()=>{});
}

function toggleMapLayer(layer) {
    if (!mapLayersReady) return;
    if (layer==='ais') {
        const vis = document.getElementById('toggle-ais')?.checked ? 'visible' : 'none';
        mapa.setLayoutProperty('ais-layer','visibility',vis);
        if (vis==='visible') loadAISLayer();
        else {
            mapa.setLayoutProperty('ais-trail','visibility','none');
        }
    }
    if (layer==='waypoints') {
        const show = document.getElementById('toggle-waypoints')?.checked;
        document.querySelectorAll('.mapboxgl-marker')
            .forEach(m => m.style.display = show ? '' : 'none');
        // Also toggle user waypoint markers
        _userWpMarkers.forEach(m => {
            const el = m.getElement();
            if (el) el.style.display = show ? '' : 'none';
        });
    }
    if (layer==='roz') {
        const vis = document.getElementById('toggle-roz')?.checked ? 'visible' : 'none';
        ['zona-radio-fill','zona-radio'].forEach(id => {
            if (mapa.getLayer(id)) mapa.setLayoutProperty(id,'visibility',vis);
        });
    }
    if (layer==='wind') {
        toggleWindAnimation();
    }
}

// =================== WAYPOINTS MANAGER ===================
let _userWaypoints = [];
let _userWpMarkers = [];
let _wpAddMode = false;
let _wpSelectedPos = null;

function openWaypointPanel() {
    const panel = document.getElementById('waypoint-add-panel');
    if (!panel) return;
    _wpAddMode = !_wpAddMode;
    panel.style.display = _wpAddMode ? 'block' : 'none';
    if (_wpAddMode) {
        mapa.getCanvas().style.cursor = 'crosshair';
    } else {
        mapa.getCanvas().style.cursor = '';
        _wpSelectedPos = null;
    }
}

mapa.on('click', e => {
    if (!_wpAddMode) return;
    _wpSelectedPos = {lat: e.lngLat.lat, lon: e.lngLat.lng};
    const posEl = document.getElementById('wp-pos');
    if (posEl) posEl.textContent = `${e.lngLat.lat.toFixed(4)}°N ${Math.abs(e.lngLat.lng).toFixed(4)}°W`;
});

function saveWaypoint() {
    if (!_wpSelectedPos) {
        alert('Haz clic en el mapa para seleccionar la posición primero.');
        return;
    }
    const nombre = (document.getElementById('wp-nombre')?.value||'').trim() || 'Mi waypoint';
    const desc = document.getElementById('wp-desc')?.value || '';
    fetch('/api/waypoints', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            nombre, lat: _wpSelectedPos.lat, lon: _wpSelectedPos.lon,
            descripcion: desc, color: '#f59e0b'
        })
    }).then(r => r.json())
    .then(() => {
        openWaypointPanel();  // close
        loadUserWaypoints();  // refresh
        if (document.getElementById('wp-nombre')) document.getElementById('wp-nombre').value = '';
        if (document.getElementById('wp-desc')) document.getElementById('wp-desc').value = '';
    })
    .catch(() => alert('Error al guardar waypoint'));
}

function loadUserWaypoints() {
    fetch('/api/waypoints').then(r => r.json()).then(data => {
        // Remove old markers
        _userWpMarkers.forEach(m => m.remove());
        _userWpMarkers = [];
        _userWaypoints = data.waypoints || [];
        _userWaypoints.forEach(wp => {
            const safeName = String(wp.nombre||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const safeDesc = String(wp.descripcion||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const marker = new mapboxgl.Marker({color: wp.color || '#f59e0b'})
                .setLngLat([wp.lon, wp.lat])
                .setPopup(new mapboxgl.Popup({offset:20})
                    .setHTML(`<strong>${safeName}</strong><br>${safeDesc}<br>
                        <small>${wp.lat.toFixed(4)}°N ${Math.abs(wp.lon).toFixed(4)}°W</small><br>
                        <button onclick="deleteWaypointById(${wp.id})" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:0.75rem;padding:2px 0">Eliminar</button>`))
                .addTo(mapa);
            _userWpMarkers.push(marker);
        });
    }).catch(() => {});
}

function deleteWaypointById(id) {
    fetch(`/api/waypoints/${id}`, {method: 'DELETE'})
        .then(() => loadUserWaypoints())
        .catch(() => {});
}

// Load user waypoints when map is ready
mapa.on('load', () => {
    setTimeout(loadUserWaypoints, 500);
});

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

// =================== ROUTING METEOROLÓGICO ===================
let _routingMode = false;
let _routingPoints = [];  // [{lat,lon}]
let _routingMarkers = [];

function toggleRoutingMode() {
    _routingMode = document.getElementById('toggle-routing')?.checked || false;
    const panel = document.getElementById('routing-panel');
    if (panel) panel.style.display = _routingMode ? 'block' : 'none';
    if (_routingMode) {
        mapa.getCanvas().style.cursor = 'crosshair';
        _routingPoints = [];
        document.getElementById('routing-status').textContent = 'Haz clic para marcar el ORIGEN';
    } else {
        mapa.getCanvas().style.cursor = '';
        limpiarRuta();
    }
}

mapa.on('click', e => {
    if (!_routingMode || _wpAddMode) return;
    if (_routingPoints.length >= 2) return;  // already have 2 points
    _routingPoints.push({lat: e.lngLat.lat, lon: e.lngLat.lng});

    const color = _routingPoints.length === 1 ? '#22c55e' : '#ef4444';
    const label = _routingPoints.length === 1 ? 'A' : 'B';
    const el = document.createElement('div');
    el.style.cssText = `width:22px;height:22px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px;border:2px solid white;cursor:pointer`;
    el.textContent = label;
    const m = new mapboxgl.Marker(el).setLngLat([e.lngLat.lng, e.lngLat.lat]).addTo(mapa);
    _routingMarkers.push(m);

    const statusEl = document.getElementById('routing-status');
    if (_routingPoints.length === 1) {
        statusEl.textContent = `A: ${e.lngLat.lat.toFixed(3)}°N ${Math.abs(e.lngLat.lng).toFixed(3)}°W — Haz clic para el DESTINO`;
    } else {
        statusEl.textContent = `Ruta A→B lista. Pulsa "Calcular ruta"`;
    }
});

function calcularRuta() {
    if (_routingPoints.length < 2) {
        alert('Selecciona 2 puntos en el mapa primero.');
        return;
    }
    const [p1, p2] = _routingPoints;
    const statusEl = document.getElementById('routing-status');
    statusEl.textContent = 'Calculando...';

    // Draw route line on map
    if (mapLayersReady) {
        if (mapa.getSource('routing-line-src')) {
            mapa.getSource('routing-line-src').setData({type:'Feature',
                geometry:{type:'LineString', coordinates:[[p1.lon,p1.lat],[p2.lon,p2.lat]]}});
        } else {
            mapa.addSource('routing-line-src', {type:'geojson', data:{type:'Feature',
                geometry:{type:'LineString', coordinates:[[p1.lon,p1.lat],[p2.lon,p2.lat]]}}});
            mapa.addLayer({id:'routing-line', type:'line', source:'routing-line-src',
                paint:{'line-color':'#4AC8E8','line-width':2,'line-opacity':0.7,'line-dasharray':[6,3]}});
        }
    }

    fetch(`/api/routing?lat1=${p1.lat}&lon1=${p1.lon}&lat2=${p2.lat}&lon2=${p2.lon}`)
        .then(r => r.json())
        .then(data => {
            if (data.error) { statusEl.textContent = 'Error: ' + data.error; return; }
            const dist = data.distance_km || 0;
            const best = data.best_departure || 'Sin ventana';
            statusEl.innerHTML = `${dist.toFixed(1)} km · Mejor salida: <strong style="color:#22c55e">${best}</strong>`;
            // Show routing popup
            showRoutingResult(data, p1, p2);
        })
        .catch(err => { statusEl.textContent = 'Error de conexión'; });
}

function showRoutingResult(data, p1, p2) {
    const mid_lat = (p1.lat + p2.lat) / 2;
    const mid_lon = (p1.lon + p2.lon) / 2;
    const pts = data.points || [];
    let timeline = '';
    if (pts[0] && pts[0].hours) {
        const hours = pts[0].hours.slice(0, 12);
        timeline = hours.map(h => {
            const c = h.score >= 6 ? '#22c55e' : h.score >= 4 ? '#f59e0b' : '#ef4444';
            return `<div style="display:inline-block;width:16px;height:28px;background:${c};opacity:0.75;margin:1px;border-radius:2px;vertical-align:top" title="${h.time} Viento:${h.wind}km Olas:${h.wave}m"></div>`;
        }).join('');
    }
    new mapboxgl.Popup({maxWidth:'280px'}).setLngLat([mid_lon, mid_lat])
        .setHTML(`<div style="font-family:monospace;font-size:0.75rem">
            <strong style="color:#4AC8E8">ROUTING METEOROLÓGICO</strong><br>
            Distancia: ${(data.distance_km||0).toFixed(1)} km<br>
            Mejor salida: <strong style="color:#22c55e">${data.best_departure || 'Sin ventana'}</strong><br>
            <div style="margin-top:4px;font-size:0.65rem;color:#999">Timeline horas (verde=bueno):</div>
            <div style="margin-top:2px">${timeline}</div>
            </div>`)
        .addTo(mapa);
}

function limpiarRuta() {
    _routingPoints = [];
    _routingMarkers.forEach(m => m.remove());
    _routingMarkers = [];
    if (mapLayersReady && mapa.getSource('routing-line-src')) {
        mapa.getSource('routing-line-src').setData({type:'Feature',geometry:{type:'LineString',coordinates:[]}});
    }
    const statusEl = document.getElementById('routing-status');
    if (statusEl) statusEl.textContent = 'Sin ruta seleccionada';
}
