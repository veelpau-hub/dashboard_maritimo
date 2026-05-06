mapboxgl.accessToken = MAPBOX_KEY;

const mapa = new mapboxgl.Map({
    container: 'mapa',
    style: 'mapbox://styles/mapbox/navigation-night-v1',
    center: [-6.3621, 36.6367],
    zoom: 11.5, pitch: 45, bearing: -15
});
window.mapa = mapa;
let mapLayersReady = false;

// =================== MEJORA 2: PARTÍCULAS DE VIENTO ===================
let windCanvas = null, windCtx = null, windAnim = null;
let windActive = false;
let windParticles = [];
const WIND_PARTICLE_COUNT = 150;
let windSpeed = 0, windDirDeg = 0;  // windSpeed en km/h

function windBeaufortColor(kmh) {
    const ms = kmh / 3.6;
    if (ms < 3)  return 'rgba(180,230,255,0.72)';   // calma: azul claro
    if (ms < 8)  return 'rgba(255,230,50,0.78)';    // brisa: amarillo
    if (ms < 14) return 'rgba(255,140,0,0.83)';     // fuerte: naranja
    return 'rgba(255,60,60,0.88)';                   // temporal: rojo
}

function initWindCanvas() {
    const mapEl = document.getElementById('mapa');
    if (!mapEl || windCanvas) return;
    windCanvas = document.createElement('canvas');
    windCanvas.id = 'wind-canvas';
    windCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;opacity:0.72';
    windCanvas.width = mapEl.offsetWidth;
    windCanvas.height = mapEl.offsetHeight;
    mapEl.appendChild(windCanvas);
    windCtx = windCanvas.getContext('2d');
    resetWindParticles();
}

function resetWindParticles() {
    if (!windCanvas) return;
    windParticles = Array.from({length: WIND_PARTICLE_COUNT}, () => ({
        x: Math.random() * windCanvas.width,
        y: Math.random() * windCanvas.height,
        age: Math.random() * 60,
        maxAge: 40 + Math.random() * 60,
    }));
}

function animateWind() {
    if (!windCtx || !windActive) return;
    const W = windCanvas.width, H = windCanvas.height;
    windCtx.fillStyle = 'rgba(10,15,30,0.18)';
    windCtx.fillRect(0, 0, W, H);
    // Meteorológico: viento FROM dirección → partículas se mueven HACIA esa dirección
    const rad = (windDirDeg + 180) * Math.PI / 180;
    const ms = windSpeed / 3.6;
    const speedFactor = Math.max(0.5, Math.min(5, ms / 3));
    const vx = Math.sin(rad) * speedFactor;
    const vy = -Math.cos(rad) * speedFactor;
    windCtx.strokeStyle = windBeaufortColor(windSpeed);
    windCtx.lineWidth = ms < 3 ? 0.8 : ms < 8 ? 1.1 : ms < 14 ? 1.5 : 2;
    windParticles.forEach(p => {
        windCtx.beginPath();
        windCtx.moveTo(p.x, p.y);
        p.x += vx + (Math.random() - 0.5) * 0.4;
        p.y += vy + (Math.random() - 0.5) * 0.4;
        windCtx.lineTo(p.x, p.y);
        windCtx.stroke();
        p.age++;
        if (p.age > p.maxAge || p.x < -10 || p.x > W+10 || p.y < -10 || p.y > H+10) {
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
        if (windCanvas) windCanvas.style.display = 'none';
    }
}

// Resetear partículas al mover/zoom el mapa (reposicionan sobre la nueva vista)
mapa.on('moveend', () => { if (windActive) resetWindParticles(); });
mapa.on('zoomend', () => { if (windActive) resetWindParticles(); });

// =================== AIS HISTORY ===================
let aisHistoryData = {};
let _aisJustClicked = false;  // evita que el click general procese clics sobre AIS

// =================== MEJORA 1: CARTA OPENSEAMAP ===================
function toggleSeamark() {
    if (!mapLayersReady) return;
    const active = document.getElementById('toggle-seamark')?.checked || false;
    if (active && !mapa.getSource('openseamap')) {
        mapa.addSource('openseamap', {
            type: 'raster',
            tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://www.openseamap.org" target="_blank">OpenSeaMap</a>'
        });
        mapa.addLayer({
            id: 'openseamap-layer', type: 'raster', source: 'openseamap',
            paint: {'raster-opacity': 0.85}
        });
    } else if (mapa.getLayer('openseamap-layer')) {
        mapa.setLayoutProperty('openseamap-layer', 'visibility', active ? 'visible' : 'none');
    }
}

// Consulta Overpass API para marcas náuticas cerca del punto clicado
function queryNauticalMark(lng, lat, lngLat) {
    const zoom = mapa.getZoom();
    const radius = Math.round(Math.max(30, 400 / Math.pow(2, zoom - 12)));
    const q = `[out:json][timeout:5];node(around:${radius},${lat.toFixed(5)},${lng.toFixed(5)})[seamark:type];out body 3;`;
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(data => {
            if (!data.elements?.length) return;
            const t = data.elements[0].tags || {};
            const type = (t['seamark:type'] || 'marca').replace(/_/g,' ');
            const name = t.name || t['seamark:name'] || '';
            const colour = t['seamark:light:colour'] || t['seamark:buoy:colour'] || '';
            const char  = t['seamark:light:character'] || '';
            const period = t['seamark:light:period'] ? `P${t['seamark:light:period']}s` : '';
            let html = `<div style="font-family:monospace;font-size:0.72rem;line-height:1.6">
                <strong style="color:#4AC8E8;text-transform:uppercase">${type}</strong>`;
            if (name) html += `<br>${name}`;
            if (colour) html += `<br>Color: <span style="text-transform:uppercase">${colour}</span>`;
            if (char) html += `<br>Luz: ${char}${period ? ' · '+period : ''}`;
            html += '</div>';
            new mapboxgl.Popup({maxWidth:'200px'}).setLngLat(lngLat).setHTML(html).addTo(mapa);
        })
        .catch(() => {});
}

// =================== MEJORA 3: WAYPOINTS NÁUTICOS ===================
let _nautRouteMode = false;
let _nautRoute = [];  // [{lat, lon, idx, id, accum, marker}]

// Convierte grados decimales a formato náutico: 36°38.2'N
function toNautDeg(deg, isLat) {
    const d = Math.abs(deg);
    const d0 = Math.floor(d);
    const min = ((d - d0) * 60).toFixed(1);
    const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${d0}°${min}'${dir}`;
}

// Distancia Haversine en millas náuticas
function haversineNm(lat1, lon1, lat2, lon2) {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Rumbo verdadero en grados
function trueBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function toggleNautRouteMode() {
    _nautRouteMode = document.getElementById('toggle-naut-route')?.checked || false;
    mapa.getCanvas().style.cursor = _nautRouteMode ? 'crosshair' : '';
    const panel = document.getElementById('naut-route-panel');
    if (panel) panel.style.display = (_nautRouteMode || _nautRoute.length > 0) ? 'block' : 'none';
}

function addNautWaypoint(lat, lon) {
    const idx = _nautRoute.length;
    const id  = `WP${String(idx + 1).padStart(3, '0')}`;
    let distFromPrev = 0, bearing = 0, accum = 0;
    if (idx > 0) {
        const prev = _nautRoute[idx - 1];
        distFromPrev = haversineNm(prev.lat, prev.lon, lat, lon);
        bearing = trueBearing(prev.lat, prev.lon, lat, lon);
        accum = prev.accum + distFromPrev;
    }
    const kts = parseFloat(document.getElementById('naut-speed')?.value || 0);
    const etaMin = (kts > 0 && distFromPrev > 0) ? Math.round(distFromPrev / kts * 60) : null;

    const el = document.createElement('div');
    el.style.cssText = 'width:22px;height:22px;background:#00d4ff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#050a12;font-weight:800;font-size:9px;border:2px solid #fff;cursor:pointer;font-family:monospace;box-shadow:0 0 8px rgba(0,212,255,0.5)';
    el.textContent = idx + 1;

    const popupHtml = `<div style="font-family:monospace;font-size:0.72rem;line-height:1.7">
        <strong style="color:#00d4ff">${id}</strong><br>
        ${toNautDeg(lat, true)}&emsp;${toNautDeg(lon, false)}
        ${idx > 0 ? `<br>Rumbo: <strong>${bearing.toFixed(0)}°T</strong>&emsp;Dist: <strong>${distFromPrev.toFixed(2)} nm</strong>` : ''}
        <br>Acumulado: <strong>${accum.toFixed(2)} nm</strong>
        ${etaMin !== null ? `<br><span style="color:#f59e0b">ETA leg: ~${etaMin} min</span>` : ''}
        <br><button onclick="removeNautWP(${idx})" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:0.7rem;padding:0;font-family:monospace;margin-top:2px">&#x2715; Eliminar este WP</button>
    </div>`;

    const marker = new mapboxgl.Marker({element: el})
        .setLngLat([lon, lat])
        .setPopup(new mapboxgl.Popup({offset: 20}).setHTML(popupHtml))
        .addTo(mapa);

    _nautRoute.push({lat, lon, idx, id, accum, marker});
    _updateNautRouteLine();
    _updateNautPanel();
}

function removeNautWP(idx) {
    if (idx < 0 || idx >= _nautRoute.length) return;
    _nautRoute[idx].marker.remove();
    const pts = _nautRoute.map(p => ({lat: p.lat, lon: p.lon}));
    pts.splice(idx, 1);
    _nautRoute = [];
    _clearNautLineData();
    pts.forEach(p => addNautWaypoint(p.lat, p.lon));
}

function clearNautRoute() {
    _nautRoute.forEach(p => p.marker.remove());
    _nautRoute = [];
    _clearNautLineData();
    _updateNautPanel();
}

function _clearNautLineData() {
    if (mapLayersReady && mapa.getSource('naut-route-src')) {
        mapa.getSource('naut-route-src').setData({type:'Feature',geometry:{type:'LineString',coordinates:[]}});
    }
}

function _updateNautRouteLine() {
    if (!mapLayersReady) return;
    const coords = _nautRoute.map(p => [p.lon, p.lat]);
    const geom = coords.length >= 2 ? coords : [];
    const data = {type:'Feature', geometry:{type:'LineString', coordinates: geom}};
    if (mapa.getSource('naut-route-src')) {
        mapa.getSource('naut-route-src').setData(data);
    } else {
        mapa.addSource('naut-route-src', {type:'geojson', data: {type:'Feature',geometry:{type:'LineString',coordinates:[]}}});
        mapa.addLayer({
            id:'naut-route-line', type:'line', source:'naut-route-src',
            paint:{'line-color':'#00d4ff','line-width':2,'line-opacity':0.85,'line-dasharray':[6,3]}
        });
        if (geom.length) mapa.getSource('naut-route-src').setData(data);
    }
}

function _updateNautPanel() {
    const total = _nautRoute.length > 0 ? _nautRoute[_nautRoute.length - 1].accum : 0;
    const el = document.getElementById('naut-route-total');
    if (el) el.textContent = _nautRoute.length > 0 ? `${_nautRoute.length} WP · ${total.toFixed(2)} nm` : '—';
}

// Recalcular ETA tras cambio de velocidad
function recalcNautETA() {
    if (_nautRoute.length === 0) return;
    const pts = _nautRoute.map(p => ({lat: p.lat, lon: p.lon}));
    _nautRoute.forEach(p => p.marker.remove());
    _nautRoute = [];
    _clearNautLineData();
    pts.forEach(p => addNautWaypoint(p.lat, p.lon));
}

// Exportar ruta en formato GPX estándar
function exportGPX() {
    if (_nautRoute.length === 0) { alert('No hay waypoints en la ruta.'); return; }
    const now = new Date().toISOString();
    const wpts = _nautRoute.map(p =>
        `  <wpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">\n    <name>${p.id}</name>\n  </wpt>`
    ).join('\n');
    const trkpts = _nautRoute.map(p =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"/>`
    ).join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Gyreo" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Gyreo Route</name><time>${now}</time></metadata>
${wpts}
  <trk><name>Ruta Náutica Gyreo</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
    const blob = new Blob([gpx], {type:'application/gpx+xml'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gyreo_${now.slice(0,10)}.gpx`;
    a.click();
}

// =================== MAP INIT ===================
mapa.on('load', () => {
    try { mapa.setPaintProperty('water', 'fill-color', '#071428'); } catch(_) {}

    // Marcador Base Naval Rota
    const navEl = document.createElement('div');
    navEl.className = 'marcador-naval';
    new mapboxgl.Marker(navEl).setLngLat([-6.3493, 36.6367])
        .setPopup(new mapboxgl.Popup({offset:25})
            .setHTML('<strong>Base Naval de Rota</strong><br>NAVSTA Rota ROZ<br><small>36.6367°N 6.3493°W</small>'))
        .addTo(mapa);

    // Puerto de Rota
    new mapboxgl.Marker({color:'#4AC8E8'}).setLngLat([-6.3620, 36.6250])
        .setPopup(new mapboxgl.Popup({offset:25}).setHTML('<strong>Puerto de Rota</strong>'))
        .addTo(mapa);

    // ROZ Rota: círculo 5nm (1nm ≈ 1852m)
    const rozCenter = [-6.3493, 36.6367];
    const rozRadiusDeg = 5 * 1852 / 111320;
    const rozPoints = Array.from({length:64}, (_, i) => {
        const angle = (i/64)*2*Math.PI;
        return [
            rozCenter[0] + rozRadiusDeg * Math.cos(angle) / Math.cos(rozCenter[1]*Math.PI/180),
            rozCenter[1] + rozRadiusDeg * Math.sin(angle)
        ];
    });
    rozPoints.push(rozPoints[0]);
    mapa.addSource('zona',{type:'geojson',data:{type:'Feature',geometry:{type:'Polygon',coordinates:[rozPoints]}}});
    mapa.addLayer({id:'zona-radio-fill',type:'fill',source:'zona',layout:{visibility:'visible'},paint:{'fill-color':'#ef4444','fill-opacity':0.06}});
    mapa.addLayer({id:'zona-radio',type:'line',source:'zona',layout:{visibility:'visible'},paint:{'line-color':'#ef4444','line-width':1.5,'line-opacity':0.5,'line-dasharray':[4,2]}});

    // AIS source + layer
    mapa.addSource('ais-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    mapa.addLayer({id:'ais-layer',type:'circle',source:'ais-src',layout:{visibility:'none'},
        paint:{'circle-radius':6,'circle-color':'#f59e0b','circle-stroke-width':1.5,'circle-stroke-color':'white','circle-opacity':0.9}});
    mapa.addSource('ais-trail-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    mapa.addLayer({id:'ais-trail',type:'line',source:'ais-trail-src',layout:{visibility:'none'},
        paint:{'line-color':'#f59e0b','line-width':1.5,'line-opacity':0.5,'line-dasharray':[2,2]}});

    // AIS click → popup + historial trail
    mapa.on('click','ais-layer', e => {
        _aisJustClicked = true;
        const p = e.features[0].properties;
        const mmsi = p.mmsi;
        const hist = aisHistoryData[mmsi] || [];
        if (hist.length > 1) {
            mapa.getSource('ais-trail-src').setData({type:'FeatureCollection',features:[{
                type:'Feature',geometry:{type:'LineString',coordinates:hist.map(h=>[h.lon,h.lat])}
            }]});
            mapa.setLayoutProperty('ais-trail','visibility','visible');
        }
        const safeName   = String(p.name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeType   = String(p.type||'-').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeSpeed  = p.speed  != null ? parseFloat(p.speed).toFixed(1)+' kt' : '-';
        const safeCourse = p.course != null ? parseFloat(p.course).toFixed(0)+'°' : '-';
        const safeMmsi   = String(mmsi||'').replace(/[^0-9]/g,'');
        new mapboxgl.Popup().setLngLat(e.lngLat)
            .setHTML(`<strong>${safeName}</strong><br>Tipo: ${safeType}<br>Vel: ${safeSpeed} | Rumbo: ${safeCourse}<br>
                <a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${safeMmsi}" target="_blank" style="color:#4AC8E8">Ver en MarineTraffic</a>`)
            .addTo(mapa);
    });
    mapa.on('mouseenter','ais-layer',()=>mapa.getCanvas().style.cursor='pointer');
    mapa.on('mouseleave','ais-layer',()=>{
        mapa.getCanvas().style.cursor = (_nautRouteMode || _wpAddMode) ? 'crosshair' : '';
    });

    // Display de coordenadas al hacer hover
    const coordDisplay = document.createElement('div');
    coordDisplay.id = 'map-coords';
    coordDisplay.style.cssText = 'position:absolute;bottom:8px;right:8px;background:rgba(13,21,32,0.85);color:rgba(255,255,255,0.5);font-size:0.65rem;padding:3px 8px;border-radius:5px;pointer-events:none;z-index:10';
    document.getElementById('panel-mapa').appendChild(coordDisplay);
    mapa.on('mousemove', e => {
        coordDisplay.textContent = `${e.lngLat.lat.toFixed(4)}°N  ${Math.abs(e.lngLat.lng).toFixed(4)}°W`;
    });

    mapa.addControl(new mapboxgl.NavigationControl(),'top-right');
    mapLayersReady = true;

    if (typeof vientoGrados !== 'undefined') windDirDeg = vientoGrados;
    if (typeof window.vientoKmh !== 'undefined') windSpeed = window.vientoKmh;

    setTimeout(loadUserWaypoints, 500);
});

// =================== DESPACHADOR ÚNICO DE CLICKS ===================
// Orden de prioridad: AIS (handled by layer event) → ruta náutica → wp add → routing → seamark
mapa.on('click', e => {
    // Si el click fue sobre una feature AIS, ignorar
    if (_aisJustClicked) { _aisJustClicked = false; return; }

    // MEJORA 3: Añadir waypoint náutico
    if (_nautRouteMode) {
        addNautWaypoint(e.lngLat.lat, e.lngLat.lng);
        return;
    }

    // Waypoint guardado (modo legacy, panel izquierdo)
    if (_wpAddMode) {
        _wpSelectedPos = {lat: e.lngLat.lat, lon: e.lngLat.lng};
        const posEl = document.getElementById('wp-pos');
        if (posEl) posEl.textContent = `${e.lngLat.lat.toFixed(4)}°N ${Math.abs(e.lngLat.lng).toFixed(4)}°W`;
        return;
    }

    // Routing meteorológico (2 puntos)
    if (_routingMode && _routingPoints.length < 2) {
        _routingPoints.push({lat: e.lngLat.lat, lon: e.lngLat.lng});
        const color = _routingPoints.length === 1 ? '#22c55e' : '#ef4444';
        const label = _routingPoints.length === 1 ? 'A' : 'B';
        const el = document.createElement('div');
        el.style.cssText = `width:22px;height:22px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px;border:2px solid white;cursor:pointer`;
        el.textContent = label;
        const m = new mapboxgl.Marker(el).setLngLat([e.lngLat.lng, e.lngLat.lat]).addTo(mapa);
        _routingMarkers.push(m);
        const statusEl = document.getElementById('routing-status');
        if (statusEl) {
            statusEl.textContent = _routingPoints.length === 1
                ? `A: ${e.lngLat.lat.toFixed(3)}°N ${Math.abs(e.lngLat.lng).toFixed(3)}°W — Haz clic para el DESTINO`
                : `Ruta A→B lista. Pulsa "Calcular ruta"`;
        }
        return;
    }

    // MEJORA 1: Consultar marcas náuticas OpenSeaMap (si la capa está activa)
    if (document.getElementById('toggle-seamark')?.checked) {
        queryNauticalMark(e.lngLat.lng, e.lngLat.lat, e.lngLat);
    }
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
                properties:{name:v.name, type:v.type, speed:v.speed, course:v.course, mmsi:v.mmsi, amenaza:v.amenaza}
            }));
        mapa.getSource('ais-src').setData({type:'FeatureCollection',features});
        vessels.forEach(v => { if (v.mmsi && v.history) aisHistoryData[v.mmsi] = v.history; });
        mapa.setPaintProperty('ais-layer','circle-color',[
            'match',['get','amenaza'],'ROJO','#ef4444','AMARILLO','#f59e0b','VERDE','#22c55e','#f59e0b'
        ]);
    }).catch(()=>{});
}

function toggleMapLayer(layer) {
    if (!mapLayersReady) return;
    if (layer==='ais') {
        const vis = document.getElementById('toggle-ais')?.checked ? 'visible' : 'none';
        mapa.setLayoutProperty('ais-layer','visibility',vis);
        if (vis==='visible') loadAISLayer();
        else mapa.setLayoutProperty('ais-trail','visibility','none');
    }
    if (layer==='waypoints') {
        const show = document.getElementById('toggle-waypoints')?.checked;
        document.querySelectorAll('.mapboxgl-marker').forEach(m => m.style.display = show ? '' : 'none');
        _userWpMarkers.forEach(m => { const el=m.getElement(); if(el) el.style.display=show?'':'none'; });
    }
    if (layer==='roz') {
        const vis = document.getElementById('toggle-roz')?.checked ? 'visible' : 'none';
        ['zona-radio-fill','zona-radio'].forEach(id => { if(mapa.getLayer(id)) mapa.setLayoutProperty(id,'visibility',vis); });
    }
    if (layer==='wind') toggleWindAnimation();
}

// =================== WAYPOINTS GUARDADOS (DB) ===================
let _userWaypoints = [];
let _userWpMarkers = [];
let _wpAddMode = false;
let _wpSelectedPos = null;

function openWaypointPanel() {
    const panel = document.getElementById('waypoint-add-panel');
    if (!panel) return;
    _wpAddMode = !_wpAddMode;
    panel.style.display = _wpAddMode ? 'block' : 'none';
    mapa.getCanvas().style.cursor = _wpAddMode ? 'crosshair' : '';
    if (!_wpAddMode) _wpSelectedPos = null;
}

function saveWaypoint() {
    if (!_wpSelectedPos) { alert('Haz clic en el mapa para seleccionar la posición primero.'); return; }
    const nombre = (document.getElementById('wp-nombre')?.value||'').trim() || 'Mi waypoint';
    const desc = document.getElementById('wp-desc')?.value || '';
    fetch('/api/waypoints', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({nombre, lat:_wpSelectedPos.lat, lon:_wpSelectedPos.lon, descripcion:desc, color:'#f59e0b'})
    }).then(r=>r.json())
    .then(() => {
        openWaypointPanel();
        loadUserWaypoints();
        if (document.getElementById('wp-nombre')) document.getElementById('wp-nombre').value='';
        if (document.getElementById('wp-desc'))   document.getElementById('wp-desc').value='';
    })
    .catch(()=>alert('Error al guardar waypoint'));
}

function loadUserWaypoints() {
    fetch('/api/waypoints').then(r=>r.json()).then(data => {
        _userWpMarkers.forEach(m=>m.remove());
        _userWpMarkers = [];
        _userWaypoints = data.waypoints || [];
        _userWaypoints.forEach(wp => {
            const safeName = String(wp.nombre||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const safeDesc = String(wp.descripcion||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const marker = new mapboxgl.Marker({color: wp.color||'#f59e0b'})
                .setLngLat([wp.lon, wp.lat])
                .setPopup(new mapboxgl.Popup({offset:20})
                    .setHTML(`<strong>${safeName}</strong><br>${safeDesc}<br>
                        <small>${wp.lat.toFixed(4)}°N ${Math.abs(wp.lon).toFixed(4)}°W</small><br>
                        <button onclick="deleteWaypointById(${wp.id})" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:0.75rem;padding:2px 0">Eliminar</button>`))
                .addTo(mapa);
            _userWpMarkers.push(marker);
        });
    }).catch(()=>{});
}

mapa.on('load', () => { setTimeout(loadUserWaypoints, 500); });

function deleteWaypointById(id) {
    fetch(`/api/waypoints/${id}`,{method:'DELETE'}).then(()=>loadUserWaypoints()).catch(()=>{});
}

function centrarEnBuque(lat, lon) {
    if (typeof switchTab==='function') switchTab('mapa');
    if (window.mapa) window.mapa.flyTo({center:[lon,lat],zoom:14,pitch:40,duration:1500});
}

// =================== ESTILO (SATELITE / NAVEGACIÓN) ===================
function toggleMapStyle() {
    const sat = document.getElementById('toggle-satellite').checked;
    mapa.setStyle(sat ? 'mapbox://styles/mapbox/satellite-streets-v12'
                      : 'mapbox://styles/mapbox/navigation-night-v1');
    mapa.once('style.load', () => {
        try { mapa.setPaintProperty('water','fill-color','#071428'); } catch(_) {}
        mapLayersReady = false;
        setTimeout(() => { mapLayersReady = true; initMapLayers(); }, 500);
    });
}

// =================== SST OVERLAY ===================
let _sstMarkers = [];

function toggleSSTOverlay() {
    const active = document.getElementById('toggle-sst')?.checked || false;
    if (!active) { _sstMarkers.forEach(m=>m.remove()); _sstMarkers=[]; return; }
    const center = mapa.getCenter();
    fetch(`/api/sst_grid?lat=${center.lat.toFixed(3)}&lon=${center.lng.toFixed(3)}`)
        .then(r=>r.json())
        .then(data => {
            _sstMarkers.forEach(m=>m.remove()); _sstMarkers=[];
            (data.grid||[]).forEach(pt => {
                const sst = pt.sst;
                const t = Math.max(0,Math.min(1,(sst-14)/12));
                const r=Math.round(t*220), b=Math.round((1-t)*220), g=Math.round(Math.min(1,2*t*(1-t)+t)*150);
                const el = document.createElement('div');
                el.style.cssText=`width:36px;height:36px;background:rgb(${r},${g},${b});border-radius:50%;opacity:0.65;display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;border:1px solid rgba(255,255,255,0.3);cursor:default`;
                el.textContent=sst.toFixed(1); el.title=`SST: ${sst.toFixed(1)}°C`;
                _sstMarkers.push(new mapboxgl.Marker({element:el,anchor:'center'}).setLngLat([pt.lon,pt.lat]).addTo(mapa));
            });
        }).catch(()=>{});
}

// =================== ROUTING METEOROLÓGICO ===================
let _routingMode = false;
let _routingPoints = [];
let _routingMarkers = [];

function toggleRoutingMode() {
    _routingMode = document.getElementById('toggle-routing')?.checked || false;
    const panel = document.getElementById('routing-panel');
    if (panel) panel.style.display = _routingMode ? 'block' : 'none';
    if (_routingMode) {
        mapa.getCanvas().style.cursor = 'crosshair';
        _routingPoints = [];
        const st = document.getElementById('routing-status');
        if (st) st.textContent = 'Haz clic para marcar el ORIGEN';
    } else {
        mapa.getCanvas().style.cursor = '';
        limpiarRuta();
    }
}

function calcularRuta() {
    if (_routingPoints.length < 2) { alert('Selecciona 2 puntos en el mapa primero.'); return; }
    const [p1,p2] = _routingPoints;
    const statusEl = document.getElementById('routing-status');
    if (statusEl) statusEl.textContent = 'Calculando...';
    if (mapLayersReady) {
        if (mapa.getSource('routing-line-src')) {
            mapa.getSource('routing-line-src').setData({type:'Feature',geometry:{type:'LineString',coordinates:[[p1.lon,p1.lat],[p2.lon,p2.lat]]}});
        } else {
            mapa.addSource('routing-line-src',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[[p1.lon,p1.lat],[p2.lon,p2.lat]]}}});
            mapa.addLayer({id:'routing-line',type:'line',source:'routing-line-src',
                paint:{'line-color':'#4AC8E8','line-width':2,'line-opacity':0.7,'line-dasharray':[6,3]}});
        }
    }
    fetch(`/api/routing?lat1=${p1.lat}&lon1=${p1.lon}&lat2=${p2.lat}&lon2=${p2.lon}`)
        .then(r=>r.json())
        .then(data => {
            if (data.error) { if(statusEl) statusEl.textContent='Error: '+data.error; return; }
            const dist = data.distance_km||0;
            if(statusEl) statusEl.innerHTML=`${dist.toFixed(1)} km · Mejor salida: <strong style="color:#22c55e">${data.best_departure||'Sin ventana'}</strong>`;
            showRoutingResult(data,p1,p2);
        })
        .catch(()=>{ if(statusEl) statusEl.textContent='Error de conexión'; });
}

function showRoutingResult(data, p1, p2) {
    const mid_lat=(p1.lat+p2.lat)/2, mid_lon=(p1.lon+p2.lon)/2;
    const pts=data.points||[];
    let timeline='';
    if (pts[0]?.hours) {
        timeline=pts[0].hours.slice(0,12).map(h=>{
            const c=h.score>=6?'#22c55e':h.score>=4?'#f59e0b':'#ef4444';
            return `<div style="display:inline-block;width:16px;height:28px;background:${c};opacity:0.75;margin:1px;border-radius:2px;vertical-align:top" title="${h.time} V:${h.wind}km O:${h.wave}m"></div>`;
        }).join('');
    }
    new mapboxgl.Popup({maxWidth:'280px'}).setLngLat([mid_lon,mid_lat])
        .setHTML(`<div style="font-family:monospace;font-size:0.75rem">
            <strong style="color:#4AC8E8">ROUTING METEOROLÓGICO</strong><br>
            Distancia: ${(data.distance_km||0).toFixed(1)} km<br>
            Mejor salida: <strong style="color:#22c55e">${data.best_departure||'Sin ventana'}</strong><br>
            <div style="margin-top:4px;font-size:0.65rem;color:#999">Timeline (verde=bueno):</div>
            <div style="margin-top:2px">${timeline}</div></div>`)
        .addTo(mapa);
}

function limpiarRuta() {
    _routingPoints=[];
    _routingMarkers.forEach(m=>m.remove()); _routingMarkers=[];
    if (mapLayersReady && mapa.getSource('routing-line-src')) {
        mapa.getSource('routing-line-src').setData({type:'Feature',geometry:{type:'LineString',coordinates:[]}});
    }
    const st=document.getElementById('routing-status');
    if(st) st.textContent='Sin ruta seleccionada';
}
