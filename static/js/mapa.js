mapboxgl.accessToken = MAPBOX_KEY;

const mapa = new mapboxgl.Map({
    container: 'mapa',
    style: 'mapbox://styles/mapbox/navigation-night-v1',
    center: [-6.3621, 36.6367],
    zoom: 11.5, pitch: 45, bearing: -15
});
window.mapa = mapa;
let mapLayersReady = false;

// =================== LAYER STATE (centralised) ===================
const _layers = {
    waypoints:    true,
    wind:         false,
    sst:          false,
    ais:          false,
    seamark:      false,
    roz:          true,
    'naut-route': false,
    routing:      false,
    // New features
    windy:        false,
    gebco:        false,
    graticule:    false,
    'route-plan': false,
};

const _CHECK_SVG = '<svg viewBox="0 0 12 12"><path d="M2 6 L5 9 L10 3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

function _updateDrawerBtn(key) {
    const btn = document.getElementById(`dl-${key}`);
    if (!btn) return;
    const on = !!_layers[key];
    btn.classList.toggle('on', on);
    const chk = btn.querySelector('.dl-chk');
    if (chk) chk.innerHTML = on ? _CHECK_SVG : '';
}

function _updateCapasCount() {
    const n = Object.values(_layers).filter(Boolean).length;
    const el = document.getElementById('capas-count');
    if (el) el.textContent = n;
}

function toggleDrawerLayer(key) {
    _layers[key] = !_layers[key];
    _updateDrawerBtn(key);
    _updateCapasCount();
    switch (key) {
        case 'waypoints':    _applyWaypointsVisibility(); break;
        case 'wind':         _applyWindAnimation(); break;
        case 'sst':          _applySSTOverlay(); break;
        case 'ais':          _applyAISLayer(); break;
        case 'seamark':      _applySeamark(); break;
        case 'roz':          _applyROZ(); break;
        case 'naut-route':   _applyNautRouteMode(); break;
        case 'routing':      _applyRoutingMode(); break;
        case 'windy':        _applyWindyOverlay(); break;
        case 'gebco':        _applyGEBCO(); break;
        case 'graticule':    _applyGraticule(); break;
        case 'route-plan':   _applyRoutePlanMode(); break;
    }
}

// =================== BASEMAP SELECTOR ===================
let _currentBasemap = 'DARK';

function setBasemap(name) {
    _currentBasemap = name;
    document.querySelectorAll('#basemap-seg button').forEach(b => {
        const txt = b.textContent.trim();
        b.classList.toggle('on',
            (name==='DARK'      && txt==='OSCURO') ||
            (name==='NAUTICAL'  && txt==='NÁUTICA') ||
            (name==='SATELLITE' && txt==='SATÉLITE')
        );
    });
    const pill = document.getElementById('basemap-pill');
    if (pill) pill.textContent = {DARK:'OSCURO', NAUTICAL:'NÁUTICA', SATELLITE:'SATÉLITE'}[name] || name;

    const style = name === 'SATELLITE'
        ? 'mapbox://styles/mapbox/satellite-streets-v12'
        : 'mapbox://styles/mapbox/navigation-night-v1';
    mapa.setStyle(style);
    mapa.once('style.load', () => {
        try { mapa.setPaintProperty('water','fill-color','#071428'); } catch(_) {}
        mapLayersReady = false;
        setTimeout(() => {
            mapLayersReady = true;
            _buildROZ();
            // Rebuild AIS sources
            if (!mapa.getSource('ais-src')) {
                mapa.addSource('ais-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
                mapa.addLayer({id:'ais-layer',type:'circle',source:'ais-src',layout:{visibility:'none'},paint:{'circle-radius':6,'circle-color':'#f59e0b','circle-stroke-width':1.5,'circle-stroke-color':'white','circle-opacity':0.9}});
                mapa.addSource('ais-trail-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
                mapa.addLayer({id:'ais-trail',type:'line',source:'ais-trail-src',layout:{visibility:'none'},paint:{'line-color':'#f59e0b','line-width':1.5,'line-opacity':0.5,'line-dasharray':[2,2]}});
            }
            if (_layers.ais) loadAISLayer();
            if (_layers.seamark || name==='NAUTICAL') { _layers.seamark=true; _updateDrawerBtn('seamark'); _applySeamark(); }
            setTimeout(loadUserWaypoints, 200);
        }, 400);
    });
}

function cycleBasemap() {
    const order = ['DARK','NAUTICAL','SATELLITE'];
    setBasemap(order[(order.indexOf(_currentBasemap)+1) % order.length]);
}

// =================== LAYERS DRAWER ===================
function toggleLayersDrawer() {
    const drawer = document.getElementById('chart-drawer');
    const scrim  = document.getElementById('drawer-scrim');
    const btn    = document.getElementById('capas-btn');
    const open   = drawer?.style.display === 'none' || !drawer?.style.display;
    if (drawer) drawer.style.display = open ? 'flex' : 'none';
    if (scrim)  scrim.style.display  = open ? 'block' : 'none';
    if (btn)    btn.classList.toggle('on', open);
}

function closeLayersDrawer() {
    const drawer = document.getElementById('chart-drawer');
    const scrim  = document.getElementById('drawer-scrim');
    const btn    = document.getElementById('capas-btn');
    if (drawer) drawer.style.display = 'none';
    if (scrim)  scrim.style.display  = 'none';
    if (btn)    btn.classList.remove('on');
}

// =================== WIND PARTICLES ===================
let windCanvas = null, windCtx = null, windAnim = null;
let windActive = false, windParticles = [];
const WIND_PARTICLE_COUNT = 150;
let windSpeed = 0, windDirDeg = 0;

function windBeaufortColor(kmh) {
    const ms = kmh / 3.6;
    if (ms < 3)  return 'rgba(180,230,255,0.72)';
    if (ms < 8)  return 'rgba(255,230,50,0.78)';
    if (ms < 14) return 'rgba(255,140,0,0.83)';
    return 'rgba(255,60,60,0.88)';
}

function initWindCanvas() {
    const mapEl = document.getElementById('mapa');
    if (!mapEl || windCanvas) return;
    windCanvas = document.createElement('canvas');
    windCanvas.id = 'wind-canvas';
    windCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:5;opacity:0.72;width:100%;height:100%';
    windCanvas.width  = mapEl.offsetWidth;
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
    const rad = (windDirDeg + 180) * Math.PI / 180;
    const ms  = windSpeed / 3.6;
    const spd = Math.max(0.5, Math.min(5, ms / 3));
    const vx  = Math.sin(rad) * spd, vy = -Math.cos(rad) * spd;
    windCtx.strokeStyle = windBeaufortColor(windSpeed);
    windCtx.lineWidth   = ms < 3 ? 0.8 : ms < 8 ? 1.1 : ms < 14 ? 1.5 : 2;
    windParticles.forEach(p => {
        windCtx.beginPath(); windCtx.moveTo(p.x, p.y);
        p.x += vx + (Math.random()-0.5)*0.4;
        p.y += vy + (Math.random()-0.5)*0.4;
        windCtx.lineTo(p.x, p.y); windCtx.stroke();
        p.age++;
        if (p.age > p.maxAge || p.x<-10 || p.x>W+10 || p.y<-10 || p.y>H+10) {
            p.x=Math.random()*W; p.y=Math.random()*H; p.age=0; p.maxAge=40+Math.random()*60;
        }
    });
    windAnim = requestAnimationFrame(animateWind);
}

function _applyWindAnimation() {
    windActive = _layers.wind;
    if (!windCanvas) initWindCanvas();
    if (windActive) { windCanvas.style.display='block'; animateWind(); }
    else { cancelAnimationFrame(windAnim); if(windCanvas) windCanvas.style.display='none'; }
}

mapa.on('moveend', () => { if (windActive) resetWindParticles(); });
mapa.on('zoomend', () => { if (windActive) resetWindParticles(); });

// =================== AIS ===================
let aisHistoryData = {}, _aisJustClicked = false;

function _applyAISLayer() {
    if (!mapLayersReady) return;
    const vis = _layers.ais ? 'visible' : 'none';
    if (mapa.getLayer('ais-layer')) {
        mapa.setLayoutProperty('ais-layer','visibility',vis);
        if (_layers.ais) loadAISLayer();
        else if (mapa.getLayer('ais-trail')) mapa.setLayoutProperty('ais-trail','visibility','none');
    }
}

function loadAISLayer() {
    if (!mapLayersReady) return;
    fetch('/api/dashboard/vigilancia').then(r=>r.json()).then(data => {
        const vessels = data.vessels || [];
        const features = vessels.filter(v=>v.lat&&v.lon).map(v=>({type:'Feature',
            geometry:{type:'Point',coordinates:[v.lon,v.lat]},
            properties:{name:v.name,type:v.type,speed:v.speed,course:v.course,mmsi:v.mmsi,amenaza:v.amenaza}}));
        mapa.getSource('ais-src').setData({type:'FeatureCollection',features});
        vessels.forEach(v => { if(v.mmsi&&v.history) aisHistoryData[v.mmsi]=v.history; });
        mapa.setPaintProperty('ais-layer','circle-color',['match',['get','amenaza'],'ROJO','#ef4444','AMARILLO','#f59e0b','VERDE','#22c55e','#f59e0b']);
        const cnt = document.getElementById('dl-count-ais');
        if (cnt) cnt.textContent = features.length || '';
    }).catch(()=>{});
}

// =================== OPENSEAMAP ===================
function _applySeamark() {
    if (!mapLayersReady) return;
    const active = _layers.seamark;
    if (active && !mapa.getSource('openseamap')) {
        mapa.addSource('openseamap',{type:'raster',tiles:['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openseamap.org" target="_blank">OpenSeaMap</a>'});
        mapa.addLayer({id:'openseamap-layer',type:'raster',source:'openseamap',paint:{'raster-opacity':0.85}});
    } else if (mapa.getLayer('openseamap-layer')) {
        mapa.setLayoutProperty('openseamap-layer','visibility',active?'visible':'none');
    }
}

function queryNauticalMark(lng, lat, lngLat) {
    const radius = Math.round(Math.max(30, 400 / Math.pow(2, mapa.getZoom()-12)));
    const q = `[out:json][timeout:5];node(around:${radius},${lat.toFixed(5)},${lng.toFixed(5)})[seamark:type];out body 3;`;
    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`)
        .then(r=>r.json())
        .then(data => {
            if (!data.elements?.length) return;
            const t=data.elements[0].tags||{};
            const type=(t['seamark:type']||'marca').replace(/_/g,' ');
            const name=t.name||t['seamark:name']||'';
            const colour=t['seamark:light:colour']||t['seamark:buoy:colour']||'';
            const char=t['seamark:light:character']||'';
            const period=t['seamark:light:period']?`P${t['seamark:light:period']}s`:'';
            let html=`<div style="font-family:monospace;font-size:0.72rem;line-height:1.6"><strong style="color:#4AC8E8;text-transform:uppercase">${type}</strong>`;
            if(name) html+=`<br>${name}`;
            if(colour) html+=`<br>Color: <span style="text-transform:uppercase">${colour}</span>`;
            if(char) html+=`<br>Luz: ${char}${period?' · '+period:''}`;
            html+='</div>';
            new mapboxgl.Popup({maxWidth:'200px'}).setLngLat(lngLat).setHTML(html).addTo(mapa);
        }).catch(()=>{});
}

// =================== ROZ ===================
function _buildROZ() {
    if (mapa.getSource('zona')) return;
    const rc=[-6.3493,36.6367], rd=5*1852/111320;
    const rp=Array.from({length:64},(_,i)=>{const a=(i/64)*2*Math.PI;return[rc[0]+rd*Math.cos(a)/Math.cos(rc[1]*Math.PI/180),rc[1]+rd*Math.sin(a)];});
    rp.push(rp[0]);
    mapa.addSource('zona',{type:'geojson',data:{type:'Feature',geometry:{type:'Polygon',coordinates:[rp]}}});
    mapa.addLayer({id:'zona-radio-fill',type:'fill',source:'zona',layout:{visibility:'visible'},paint:{'fill-color':'#ef4444','fill-opacity':0.06}});
    mapa.addLayer({id:'zona-radio',type:'line',source:'zona',layout:{visibility:'visible'},paint:{'line-color':'#ef4444','line-width':1.5,'line-opacity':0.5,'line-dasharray':[4,2]}});
}

function _applyROZ() {
    if (!mapLayersReady) return;
    const vis=_layers.roz?'visible':'none';
    ['zona-radio-fill','zona-radio'].forEach(id=>{if(mapa.getLayer(id))mapa.setLayoutProperty(id,'visibility',vis);});
}

// =================== NAUTICAL WAYPOINTS ===================
let _nautRouteMode = false, _nautRoute = [];

function toNautDeg(deg, isLat) {
    const d=Math.abs(deg), d0=Math.floor(d), min=((d-d0)*60).toFixed(1);
    const dir=isLat?(deg>=0?'N':'S'):(deg>=0?'E':'W');
    return `${d0}°${min}'${dir}`;
}

function haversineNm(lat1,lon1,lat2,lon2) {
    const R=3440.065, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function trueBearing(lat1,lon1,lat2,lon2) {
    const dLon=(lon2-lon1)*Math.PI/180, φ1=lat1*Math.PI/180, φ2=lat2*Math.PI/180;
    const y=Math.sin(dLon)*Math.cos(φ2), x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(dLon);
    return(Math.atan2(y,x)*180/Math.PI+360)%360;
}

function _applyNautRouteMode() {
    _nautRouteMode = _layers['naut-route'];
    mapa.getCanvas().style.cursor = _nautRouteMode ? 'crosshair' : '';
    const panel = document.getElementById('naut-route-panel');
    if (panel) panel.style.display = (_nautRouteMode||_nautRoute.length>0) ? 'block' : 'none';
}

function addNautWaypoint(lat, lon) {
    const idx=_nautRoute.length, id=`WP${String(idx+1).padStart(3,'0')}`;
    let distFromPrev=0, bearing=0, accum=0;
    if (idx>0) {
        const prev=_nautRoute[idx-1];
        distFromPrev=haversineNm(prev.lat,prev.lon,lat,lon);
        bearing=trueBearing(prev.lat,prev.lon,lat,lon);
        accum=prev.accum+distFromPrev;
    }
    const kts=parseFloat(document.getElementById('naut-speed')?.value||0);
    const etaMin=(kts>0&&distFromPrev>0)?Math.round(distFromPrev/kts*60):null;
    const el=document.createElement('div');
    el.style.cssText='width:22px;height:22px;background:#00d4ff;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#050a12;font-weight:800;font-size:9px;border:2px solid #fff;cursor:pointer;font-family:monospace;box-shadow:0 0 8px rgba(0,212,255,0.5)';
    el.textContent=idx+1;
    const popupHtml=`<div style="font-family:monospace;font-size:0.72rem;line-height:1.7"><strong style="color:#00d4ff">${id}</strong><br>${toNautDeg(lat,true)}&emsp;${toNautDeg(lon,false)}${idx>0?`<br>Rumbo: <strong>${bearing.toFixed(0)}°T</strong>&emsp;Dist: <strong>${distFromPrev.toFixed(2)} nm</strong>`:''}<br>Acumulado: <strong>${accum.toFixed(2)} nm</strong>${etaMin!==null?`<br><span style="color:#f59e0b">ETA leg: ~${etaMin} min</span>`:''}<br><button onclick="removeNautWP(${idx})" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:0.7rem;padding:0;font-family:monospace;margin-top:2px">&#x2715; Eliminar</button></div>`;
    const marker=new mapboxgl.Marker({element:el}).setLngLat([lon,lat]).setPopup(new mapboxgl.Popup({offset:20}).setHTML(popupHtml)).addTo(mapa);
    _nautRoute.push({lat,lon,idx,id,accum,marker});
    _updateNautRouteLine(); _updateNautPanel();
}

function removeNautWP(idx) {
    if(idx<0||idx>=_nautRoute.length) return;
    _nautRoute[idx].marker.remove();
    const pts=_nautRoute.map(p=>({lat:p.lat,lon:p.lon})); pts.splice(idx,1);
    _nautRoute=[]; _clearNautLineData();
    pts.forEach(p=>addNautWaypoint(p.lat,p.lon));
}

function clearNautRoute() {
    _nautRoute.forEach(p=>p.marker.remove()); _nautRoute=[];
    _clearNautLineData(); _updateNautPanel();
    _layers['naut-route']=false; _updateDrawerBtn('naut-route'); _updateCapasCount(); _applyNautRouteMode();
}

function _clearNautLineData() {
    if(mapLayersReady&&mapa.getSource('naut-route-src'))
        mapa.getSource('naut-route-src').setData({type:'Feature',geometry:{type:'LineString',coordinates:[]}});
}

function _updateNautRouteLine() {
    if(!mapLayersReady) return;
    const coords=_nautRoute.map(p=>[p.lon,p.lat]);
    const data={type:'Feature',geometry:{type:'LineString',coordinates:coords.length>=2?coords:[]}};
    if(mapa.getSource('naut-route-src')) { mapa.getSource('naut-route-src').setData(data); }
    else {
        mapa.addSource('naut-route-src',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[]}}});
        mapa.addLayer({id:'naut-route-line',type:'line',source:'naut-route-src',paint:{'line-color':'#00d4ff','line-width':2,'line-opacity':0.85,'line-dasharray':[6,3]}});
        if(coords.length>=2) mapa.getSource('naut-route-src').setData(data);
    }
}

function _updateNautPanel() {
    const total=_nautRoute.length>0?_nautRoute[_nautRoute.length-1].accum:0;
    const el=document.getElementById('naut-route-total');
    if(el) el.textContent=_nautRoute.length>0?`${_nautRoute.length} WP · ${total.toFixed(2)} nm`:'—';
    const cnt=document.getElementById('dl-count-naut-route');
    if(cnt) cnt.textContent=_nautRoute.length>0?_nautRoute.length:'';
}

function recalcNautETA() {
    const pts=_nautRoute.map(p=>({lat:p.lat,lon:p.lon}));
    _nautRoute.forEach(p=>p.marker.remove()); _nautRoute=[]; _clearNautLineData();
    pts.forEach(p=>addNautWaypoint(p.lat,p.lon));
}

function exportGPX() {
    if(_nautRoute.length===0){alert('No hay waypoints en la ruta.');return;}
    const now=new Date().toISOString();
    const wpts=_nautRoute.map(p=>`  <wpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">\n    <name>${p.id}</name>\n  </wpt>`).join('\n');
    const trkpts=_nautRoute.map(p=>`      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"/>`).join('\n');
    const gpx=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Gyreo" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>Gyreo Route</name><time>${now}</time></metadata>\n${wpts}\n  <trk><name>Ruta Náutica Gyreo</name><trkseg>\n${trkpts}\n  </trkseg></trk>\n</gpx>`;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([gpx],{type:'application/gpx+xml'}));
    a.download=`gyreo_${now.slice(0,10)}.gpx`; a.click();
}

// =================== MEASUREMENT TOOL ===================
let _measureMode = false, _measureStart = null;

function toggleMeasureTool() {
    _measureMode = !_measureMode; _measureStart = null;
    document.getElementById('measure-btn')?.classList.toggle('active', _measureMode);
    mapa.getCanvas().style.cursor = _measureMode ? 'crosshair' : '';
    if (!_measureMode) { const r=document.getElementById('readout-measure'); if(r) r.style.display='none'; }
}

function clearMeasure() {
    _measureMode=false; _measureStart=null;
    document.getElementById('measure-btn')?.classList.remove('active');
    const r=document.getElementById('readout-measure'); if(r) r.style.display='none';
    mapa.getCanvas().style.cursor='';
}

function _handleMeasureClick(lat, lon) {
    if (!_measureStart) { _measureStart={lat,lon}; return; }
    const dist=haversineNm(_measureStart.lat,_measureStart.lon,lat,lon);
    const val=document.getElementById('readout-measure-val');
    const eta=document.getElementById('readout-measure-eta');
    const row=document.getElementById('readout-measure');
    if(val) val.textContent=`${dist.toFixed(2)} NM`;
    if(eta) eta.textContent=dist>0?`${(dist/10*60).toFixed(0)} min @ 10kt`:'';
    if(row) row.style.display='flex';
    _measureStart={lat,lon};
}

// =================== MAP INIT ===================
mapa.on('load', () => {
    try { mapa.setPaintProperty('water','fill-color','#071428'); } catch(_) {}

    const navEl=document.createElement('div');
    navEl.className='marcador-naval';
    new mapboxgl.Marker(navEl).setLngLat([-6.3493,36.6367])
        .setPopup(new mapboxgl.Popup({offset:25}).setHTML('<strong>Base Naval de Rota</strong><br>NAVSTA Rota ROZ<br><small>36.6367°N 6.3493°W</small>'))
        .addTo(mapa);
    new mapboxgl.Marker({color:'#4AC8E8'}).setLngLat([-6.3620,36.6250])
        .setPopup(new mapboxgl.Popup({offset:25}).setHTML('<strong>Puerto de Rota</strong>'))
        .addTo(mapa);

    _buildROZ();

    mapa.addSource('ais-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    mapa.addLayer({id:'ais-layer',type:'circle',source:'ais-src',layout:{visibility:'none'},paint:{'circle-radius':6,'circle-color':'#f59e0b','circle-stroke-width':1.5,'circle-stroke-color':'white','circle-opacity':0.9}});
    mapa.addSource('ais-trail-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    mapa.addLayer({id:'ais-trail',type:'line',source:'ais-trail-src',layout:{visibility:'none'},paint:{'line-color':'#f59e0b','line-width':1.5,'line-opacity':0.5,'line-dasharray':[2,2]}});

    mapa.on('click','ais-layer', e => {
        _aisJustClicked=true;
        const p=e.features[0].properties, mmsi=p.mmsi, hist=aisHistoryData[mmsi]||[];
        if(hist.length>1){mapa.getSource('ais-trail-src').setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:hist.map(h=>[h.lon,h.lat])}}]});mapa.setLayoutProperty('ais-trail','visibility','visible');}
        const safeName=String(p.name||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeType=String(p.type||'-').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const safeSpeed=p.speed!=null?parseFloat(p.speed).toFixed(1)+' kt':'-';
        const safeCourse=p.course!=null?parseFloat(p.course).toFixed(0)+'°':'-';
        const safeMmsi=String(mmsi||'').replace(/[^0-9]/g,'');
        new mapboxgl.Popup().setLngLat(e.lngLat)
            .setHTML(`<strong>${safeName}</strong><br>Tipo: ${safeType}<br>Vel: ${safeSpeed} | Rumbo: ${safeCourse}<br><a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${safeMmsi}" target="_blank" style="color:#4AC8E8">MarineTraffic</a>`)
            .addTo(mapa);
    });
    mapa.on('mouseenter','ais-layer',()=>mapa.getCanvas().style.cursor='pointer');
    mapa.on('mouseleave','ais-layer',()=>{ mapa.getCanvas().style.cursor=(_nautRouteMode||_wpAddMode||_measureMode)?'crosshair':''; });

    mapa.on('mousemove', e => {
        const latEl=document.getElementById('readout-lat');
        const lonEl=document.getElementById('readout-lon');
        if(latEl) latEl.textContent=`${e.lngLat.lat.toFixed(4)}°N`;
        if(lonEl) lonEl.textContent=`${Math.abs(e.lngLat.lng).toFixed(4)}°W`;
    });

    mapa.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');
    mapLayersReady=true;

    if(typeof vientoGrados!=='undefined') windDirDeg=vientoGrados;
    if(typeof window.vientoKmh!=='undefined') windSpeed=window.vientoKmh;

    setTimeout(loadUserWaypoints,500);
    _updateCapasCount();
});

// =================== UNIFIED CLICK DISPATCHER ===================
mapa.on('click', e => {
    if (_aisJustClicked) { _aisJustClicked=false; return; }
    if (_rp.mode && (_rp.origin === null || _rp.dest === null)) { _handleRoutePlanClick(e.lngLat.lat,e.lngLat.lng); return; }
    if (_nautRouteMode) { addNautWaypoint(e.lngLat.lat,e.lngLat.lng); return; }
    if (_measureMode)   { _handleMeasureClick(e.lngLat.lat,e.lngLat.lng); return; }
    if (_wpAddMode) {
        _wpSelectedPos={lat:e.lngLat.lat,lon:e.lngLat.lng};
        const posEl=document.getElementById('wp-pos');
        if(posEl) posEl.textContent=`${e.lngLat.lat.toFixed(4)}°N ${Math.abs(e.lngLat.lng).toFixed(4)}°W`;
        return;
    }
    if (_routingMode&&_routingPoints.length<2) {
        _routingPoints.push({lat:e.lngLat.lat,lon:e.lngLat.lng});
        const color=_routingPoints.length===1?'#22c55e':'#ef4444';
        const label=_routingPoints.length===1?'A':'B';
        const el=document.createElement('div');
        el.style.cssText=`width:22px;height:22px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:11px;border:2px solid white;cursor:pointer`;
        el.textContent=label;
        _routingMarkers.push(new mapboxgl.Marker(el).setLngLat([e.lngLat.lng,e.lngLat.lat]).addTo(mapa));
        const st=document.getElementById('routing-status');
        if(st) st.textContent=_routingPoints.length===1?`A: ${e.lngLat.lat.toFixed(3)}°N — clic para DESTINO`:`Listo. Pulsa CALCULAR`;
        return;
    }
    if (_layers.seamark) queryNauticalMark(e.lngLat.lng,e.lngLat.lat,e.lngLat);
});

// =================== SAVED WAYPOINTS (DB) ===================
let _userWaypoints=[], _userWpMarkers=[], _wpAddMode=false, _wpSelectedPos=null;

function openWaypointPanel() {
    const panel=document.getElementById('waypoint-add-panel');
    if(!panel) return;
    _wpAddMode=!_wpAddMode;
    panel.style.display=_wpAddMode?'block':'none';
    mapa.getCanvas().style.cursor=_wpAddMode?'crosshair':'';
    if(!_wpAddMode) _wpSelectedPos=null;
}

function saveWaypoint() {
    if(!_wpSelectedPos){alert('Haz clic en el mapa para seleccionar la posición primero.');return;}
    const nombre=(document.getElementById('wp-nombre')?.value||'').trim()||'Mi waypoint';
    const desc=document.getElementById('wp-desc')?.value||'';
    fetch('/api/waypoints',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre,lat:_wpSelectedPos.lat,lon:_wpSelectedPos.lon,descripcion:desc,color:'#f59e0b'})})
        .then(r=>r.json())
        .then(()=>{openWaypointPanel();loadUserWaypoints();
            if(document.getElementById('wp-nombre'))document.getElementById('wp-nombre').value='';
            if(document.getElementById('wp-desc'))document.getElementById('wp-desc').value='';})
        .catch(()=>alert('Error al guardar waypoint'));
}

function loadUserWaypoints() {
    fetch('/api/waypoints').then(r=>r.json()).then(data=>{
        _userWpMarkers.forEach(m=>m.remove()); _userWpMarkers=[];
        _userWaypoints=data.waypoints||[];
        const vis=_layers.waypoints;
        _userWaypoints.forEach(wp=>{
            const safeName=String(wp.nombre||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const safeDesc=String(wp.descripcion||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const marker=new mapboxgl.Marker({color:wp.color||'#f59e0b'})
                .setLngLat([wp.lon,wp.lat])
                .setPopup(new mapboxgl.Popup({offset:20}).setHTML(`<strong>${safeName}</strong><br>${safeDesc}<br><small>${wp.lat.toFixed(4)}°N ${Math.abs(wp.lon).toFixed(4)}°W</small><br><button onclick="deleteWaypointById(${wp.id})" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:0.75rem;padding:2px 0">Eliminar</button>`))
                .addTo(mapa);
            if(!vis){const e=marker.getElement();if(e)e.style.display='none';}
            _userWpMarkers.push(marker);
        });
        const cnt=document.getElementById('dl-count-waypoints');
        if(cnt) cnt.textContent=_userWaypoints.length||'';
    }).catch(()=>{});
}

mapa.on('load',()=>{ setTimeout(loadUserWaypoints,600); });

function _applyWaypointsVisibility() {
    const show=_layers.waypoints;
    _userWpMarkers.forEach(m=>{const e=m.getElement();if(e)e.style.display=show?'':'none';});
}

function deleteWaypointById(id) {
    fetch(`/api/waypoints/${id}`,{method:'DELETE'}).then(()=>loadUserWaypoints()).catch(()=>{});
}

function centrarEnBuque(lat,lon) {
    if(typeof switchTab==='function') switchTab('mapa');
    if(window.mapa) window.mapa.flyTo({center:[lon,lat],zoom:14,pitch:40,duration:1500});
}

// =================== SST OVERLAY ===================
let _sstMarkers=[];

function _applySSTOverlay() {
    const active=_layers.sst;
    if(!active){_sstMarkers.forEach(m=>m.remove());_sstMarkers=[];return;}
    const center=mapa.getCenter();
    fetch(`/api/sst_grid?lat=${center.lat.toFixed(3)}&lon=${center.lng.toFixed(3)}`)
        .then(r=>r.json())
        .then(data=>{
            _sstMarkers.forEach(m=>m.remove());_sstMarkers=[];
            (data.grid||[]).forEach(pt=>{
                const sst=pt.sst,t=Math.max(0,Math.min(1,(sst-14)/12));
                const r2=Math.round(t*220),b2=Math.round((1-t)*220),g2=Math.round(Math.min(1,2*t*(1-t)+t)*150);
                const el=document.createElement('div');
                el.style.cssText=`width:36px;height:36px;background:rgb(${r2},${g2},${b2});border-radius:50%;opacity:0.65;display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;border:1px solid rgba(255,255,255,0.3);cursor:default`;
                el.textContent=sst.toFixed(1);el.title=`SST: ${sst.toFixed(1)}°C`;
                _sstMarkers.push(new mapboxgl.Marker({element:el,anchor:'center'}).setLngLat([pt.lon,pt.lat]).addTo(mapa));
            });
            const cnt=document.getElementById('dl-count-sst');
            if(cnt&&data.grid?.length) cnt.textContent=`${(data.grid[0]?.sst||0).toFixed(1)}°`;
        }).catch(()=>{});
}

// =================== ROUTING METEOROLÓGICO ===================
let _routingMode=false, _routingPoints=[], _routingMarkers=[];

function _applyRoutingMode() {
    _routingMode=_layers.routing;
    const panel=document.getElementById('routing-panel');
    if(panel) panel.style.display=_routingMode?'block':'none';
    if(_routingMode){
        mapa.getCanvas().style.cursor='crosshair'; _routingPoints=[];
        const st=document.getElementById('routing-status');
        if(st) st.textContent='Haz clic para ORIGEN';
    } else { mapa.getCanvas().style.cursor=''; limpiarRuta(); }
}

function calcularRuta() {
    if(_routingPoints.length<2){alert('Selecciona 2 puntos primero.');return;}
    const[p1,p2]=_routingPoints;
    const st=document.getElementById('routing-status');
    if(st) st.textContent='Calculando...';
    if(mapLayersReady) {
        if(mapa.getSource('routing-line-src')) {
            mapa.getSource('routing-line-src').setData({type:'Feature',geometry:{type:'LineString',coordinates:[[p1.lon,p1.lat],[p2.lon,p2.lat]]}});
        } else {
            mapa.addSource('routing-line-src',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[[p1.lon,p1.lat],[p2.lon,p2.lat]]}}});
            mapa.addLayer({id:'routing-line',type:'line',source:'routing-line-src',paint:{'line-color':'#4AC8E8','line-width':2,'line-opacity':0.7,'line-dasharray':[6,3]}});
        }
    }
    fetch(`/api/routing?lat1=${p1.lat}&lon1=${p1.lon}&lat2=${p2.lat}&lon2=${p2.lon}`)
        .then(r=>r.json())
        .then(data=>{
            if(data.error){if(st)st.textContent='Error: '+data.error;return;}
            if(st) st.innerHTML=`${(data.distance_km||0).toFixed(1)} km · <strong style="color:#22c55e">${data.best_departure||'—'}</strong>`;
            _showRoutingResult(data,p1,p2);
        }).catch(()=>{if(st)st.textContent='Error de conexión';});
}

function _showRoutingResult(data,p1,p2) {
    const mid_lat=(p1.lat+p2.lat)/2,mid_lon=(p1.lon+p2.lon)/2,pts=data.points||[];
    let timeline='';
    if(pts[0]?.hours) timeline=pts[0].hours.slice(0,12).map(h=>{const c=h.score>=6?'#22c55e':h.score>=4?'#f59e0b':'#ef4444';return`<div style="display:inline-block;width:16px;height:28px;background:${c};opacity:0.75;margin:1px;border-radius:2px;vertical-align:top" title="${h.time} V:${h.wind}km O:${h.wave}m"></div>`;}).join('');
    new mapboxgl.Popup({maxWidth:'280px'}).setLngLat([mid_lon,mid_lat])
        .setHTML(`<div style="font-family:monospace;font-size:0.75rem"><strong style="color:#4AC8E8">ROUTING METEOROLÓGICO</strong><br>Dist: ${(data.distance_km||0).toFixed(1)} km<br>Salida: <strong style="color:#22c55e">${data.best_departure||'—'}</strong><br><div style="margin-top:4px">${timeline}</div></div>`)
        .addTo(mapa);
}

function limpiarRuta() {
    _routingPoints=[];_routingMarkers.forEach(m=>m.remove());_routingMarkers=[];
    if(mapLayersReady&&mapa.getSource('routing-line-src'))
        mapa.getSource('routing-line-src').setData({type:'Feature',geometry:{type:'LineString',coordinates:[]}});
    const st=document.getElementById('routing-status');if(st)st.textContent='Sin ruta';
}

// ============================================================
// FEATURE 1 — WINDY IFRAME OVERLAY
// The Windy JS API is incompatible with Mapbox GL JS as an overlay.
// We use Windy's public embed URL in an iframe instead — reliable,
// no API key needed for the iframe embed, and supports all layers.
// The iframe is positioned absolutely over the map and reloaded
// when the user changes layers or re-centres the view.
// ============================================================
let _windyLayer = 'wind';

function _buildWindyUrl(layer) {
    const c = mapa.getCenter();
    const z = Math.max(4, Math.min(12, Math.round(mapa.getZoom())));
    return 'https://embed.windy.com/embed.html' +
        '?type=map&location=coordinates' +
        '&metricRain=mm&metricTemp=%C2%B0C&metricWind=kt' +
        `&zoom=${z}&lat=${c.lat.toFixed(3)}&lon=${c.lng.toFixed(3)}` +
        `&overlay=${layer}&product=ecmwf&level=surface`;
}

function _loadWindyIframe() {
    const div = document.getElementById('windy');
    if (!div) return;
    const url = _buildWindyUrl(_windyLayer);
    const frame = div.querySelector('iframe');
    if (frame) {
        frame.src = url;
    } else {
        div.innerHTML =
            `<iframe src="${url}" ` +
            `style="width:100%;height:100%;border:none;" ` +
            `allowfullscreen loading="lazy"></iframe>`;
    }
}

function _applyWindyOverlay() {
    const div = document.getElementById('windy');
    const sel = document.getElementById('windy-layer-sel');
    const cnt = document.getElementById('dl-count-windy');
    if (!div) return;

    if (_layers.windy) {
        div.style.display = 'block';
        if (sel) sel.style.display = 'flex';
        if (cnt) cnt.textContent = _windyLayer.toUpperCase();
        _loadWindyIframe();
    } else {
        div.style.display = 'none';
        if (sel) sel.style.display = 'none';
        if (cnt) cnt.textContent = '';
    }
}

function setWindyLayer(layer) {
    _windyLayer = layer;
    document.querySelectorAll('.wls-btn').forEach(b =>
        b.classList.toggle('on', b.dataset.layer === layer));
    const cnt = document.getElementById('dl-count-windy');
    if (cnt && _layers.windy) cnt.textContent = layer.toUpperCase();
    if (_layers.windy) _loadWindyIframe();
}

// ============================================================
// FEATURE 2 — GEBCO BATHYMETRY
// GEBCO tiles as a Mapbox GL raster layer.
// ============================================================
// GEBCO WMS endpoint — confirmed working with CORS (Access-Control-Allow-Origin: *)
// tiles.gebco.net/overlays/* timed out; wms.gebco.net WMS is the reliable alternative.
const GEBCO_WMS = 'https://wms.gebco.net/mapserv?' +
    'SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap' +
    '&BBOX={bbox-epsg-3857}&SRS=EPSG:3857' +
    '&WIDTH=256&HEIGHT=256' +
    '&LAYERS=GEBCO_LATEST&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=TRUE';

function _applyGEBCO() {
    if (!mapLayersReady) return;
    const active = _layers.gebco;
    if (active && !mapa.getSource('gebco')) {
        mapa.addSource('gebco', {
            type: 'raster',
            tiles: [GEBCO_WMS],
            tileSize: 256,
            attribution: '© GEBCO',
        });
        // Insert below the first fill/line layer so it sits under all vector overlays.
        const firstFill = mapa.getStyle().layers.find(l => l.type === 'fill' || l.type === 'line')?.id;
        mapa.addLayer({
            id: 'gebco-layer', type: 'raster', source: 'gebco',
            paint: { 'raster-opacity': 0.65 },
        }, firstFill);
    } else if (mapa.getLayer('gebco-layer')) {
        mapa.setLayoutProperty('gebco-layer', 'visibility', active ? 'visible' : 'none');
    }
}

// ============================================================
// FEATURE 3 — COORDINATE GRATICULE
// Dynamic GeoJSON grid updated on every map moveend.
// Step adapts to zoom: 1° at z<8, 0.5° at z<11, 0.25° otherwise.
// ============================================================
function _applyGraticule() {
    if (!mapLayersReady) return;
    if (_layers.graticule) {
        if (!mapa.getSource('graticule')) _initGraticule();
        if (mapa.getLayer('graticule-lines')) mapa.setLayoutProperty('graticule-lines', 'visibility', 'visible');
        _updateGraticule();
        mapa.on('moveend', _updateGraticule);
        mapa.on('zoomend', _updateGraticule);
    } else {
        if (mapa.getLayer('graticule-lines')) mapa.setLayoutProperty('graticule-lines', 'visibility', 'none');
        mapa.off('moveend', _updateGraticule);
        mapa.off('zoomend', _updateGraticule);
    }
}

function _initGraticule() {
    // Only a line layer — symbol layers require specific glyph stacks that
    // differ between Mapbox styles and fail silently when fonts aren't available.
    mapa.addSource('graticule', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapa.addLayer({
        id: 'graticule-lines', type: 'line', source: 'graticule',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#4AC8E8', 'line-width': 0.5, 'line-opacity': 0.45, 'line-dasharray': [4, 4] },
    });
}

function _updateGraticule() {
    if (!_layers.graticule) return;
    const src = mapa.getSource('graticule');
    if (!src) return;

    const b    = mapa.getBounds();
    const z    = mapa.getZoom();
    const step = z < 7 ? 2 : z < 9 ? 1 : z < 11 ? 0.5 : 0.25;

    // Round bounds outward to nearest step to avoid partial lines at edges
    const minLat = Math.floor(b.getSouth() / step) * step;
    const maxLat = Math.ceil(b.getNorth()  / step) * step;
    const minLon = Math.floor(b.getWest()  / step) * step;
    const maxLon = Math.ceil(b.getEast()   / step) * step;

    const features = [];
    const MAXITER = 500; // safety cap against floating-point drift
    let iter;

    iter = 0;
    for (let lat = minLat; lat <= maxLat + step * 0.01 && iter < MAXITER; lat += step, iter++) {
        const y = +lat.toFixed(6);
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[minLon, y], [maxLon, y]] } });
    }
    iter = 0;
    for (let lon = minLon; lon <= maxLon + step * 0.01 && iter < MAXITER; lon += step, iter++) {
        const x = +lon.toFixed(6);
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[x, minLat], [x, maxLat]] } });
    }
    src.setData({ type: 'FeatureCollection', features });
}

// ============================================================
// FEATURE 4 — NAUTICAL ROUTE PLANNING WITH TURF.JS
// Workflow:
//   1. User clicks origin then destination
//   2. Query Overpass for hazards + lateral buoys near route
//   3. Turf.js booleanIntersects → bypass waypoints (0.3 NM margin)
//   4. Detect destination port; order R/G buoys, build channel WPs
//   5. Feature 5 — Open-Meteo Marine weather check per segment
//   6. Show results panel; export GPX
// ============================================================
let _rp = {
    mode:     false,        // planning active
    origin:   null,         // {lat, lon}
    dest:     null,         // {lat, lon}
    markers:  [],
    lineIds:  [],
    result:   null,         // computed route
};

function _applyRoutePlanMode() {
    _rp.mode = _layers['route-plan'];
    const panel = document.getElementById('route-plan-panel');
    if (!_rp.mode) {
        mapa.getCanvas().style.cursor = '';
        if (panel) panel.style.display = 'none';
        _resetRPMarkers();
    } else {
        mapa.getCanvas().style.cursor = 'crosshair';
        if (panel) { panel.style.display = 'block'; }
        _setRPHint('CLIC EN EL MAPA → ORIGEN');
    }
}

function _setRPHint(msg) {
    const el = document.getElementById('rp-hint');
    if (el) el.textContent = msg;
}

function _resetRPMarkers() {
    _rp.markers.forEach(m => m.remove());
    _rp.markers = [];
    _rp.origin  = null;
    _rp.dest    = null;
    _rp.lineIds.forEach(id => { if (mapa.getLayer(id)) mapa.removeLayer(id); if (mapa.getSource(id)) mapa.removeSource(id); });
    _rp.lineIds = [];
}

function resetRoutePlan() {
    _resetRPMarkers();
    const seg = document.getElementById('rp-segments'); if (seg) seg.innerHTML = '';
    const tot = document.getElementById('rp-total');    if (tot) tot.style.display = 'none';
    const act = document.getElementById('rp-actions'); if (act) act.style.display = 'none';
    _setRPHint('CLIC EN EL MAPA → ORIGEN');
}

function cancelRoutePlan() {
    _layers['route-plan'] = false;
    _updateDrawerBtn('route-plan');
    _updateCapasCount();
    _applyRoutePlanMode();
}

// Called from the unified click dispatcher
function _handleRoutePlanClick(lat, lon) {
    if (!_rp.origin) {
        _rp.origin = { lat, lon };
        const el = document.createElement('div');
        el.style.cssText = 'width:18px;height:18px;background:#22c55e;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(34,197,94,0.6)';
        _rp.markers.push(new mapboxgl.Marker({ element: el }).setLngLat([lon, lat]).addTo(mapa));
        _setRPHint('CLIC EN EL MAPA → DESTINO');
    } else if (!_rp.dest) {
        _rp.dest = { lat, lon };
        const el = document.createElement('div');
        el.style.cssText = 'width:18px;height:18px;background:#ef4444;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(239,68,68,0.6)';
        _rp.markers.push(new mapboxgl.Marker({ element: el }).setLngLat([lon, lat]).addTo(mapa));
        _setRPHint('Calculando ruta…');
        _computeRoutePlan();
    }
}

async function _computeRoutePlan() {
    if (!_rp.origin || !_rp.dest) return;
    const { lat: oLat, lon: oLon } = _rp.origin;
    const { lat: dLat, lon: dLon } = _rp.dest;

    // 1. Direct line
    const originPt = turf.point([oLon, oLat]);
    const destPt   = turf.point([dLon, dLat]);
    const directLine = turf.lineString([[oLon, oLat], [dLon, dLat]]);

    // 2. Fetch maritime hazards near route via Overpass
    const hazards = await _fetchHazards(oLat, oLon, dLat, dLon);

    // 3. Build ordered waypoints with hazard avoidance
    let coords = [[oLon, oLat]];
    for (const haz of hazards) {
        try {
            if (turf.booleanIntersects(directLine, haz)) {
                const bypass = _computeBypassPoint(directLine, haz, 0.3);
                if (bypass) coords.push(bypass);
            }
        } catch (_) {}
    }

    // 4. Fetch lateral buoys near destination, build channel entry WPs
    const channelWPs = await _fetchChannelWaypoints(dLat, dLon);
    coords = [...coords, ...channelWPs, [dLon, dLat]];

    // 5. Build segments
    const segments = [];
    for (let i = 0; i < coords.length - 1; i++) {
        const from = coords[i], to = coords[i + 1];
        const dist = haversineNm(from[1], from[0], to[1], to[0]);
        const brg  = trueBearing(from[1], from[0], to[1], to[0]);
        segments.push({ from, to, dist: +dist.toFixed(3), bearing: +brg.toFixed(0), name: _segName(i, coords.length) });
    }

    // 6. Weather check per segment
    const warnings = await _checkWeather(segments);

    // 7. Draw route and show results
    _drawRoutePlanLine(coords);
    _rp.result = { coords, segments, warnings };
    _displayRoutePlanResults(segments, warnings);
}

function _segName(i, total) {
    if (i === 0) return 'ORIGEN';
    if (i === total - 2) return 'LLEGADA';
    return `WP-${String(i).padStart(2, '0')}`;
}

async function _fetchHazards(oLat, oLon, dLat, dLon) {
    const midLat = (oLat + dLat) / 2, midLon = (oLon + dLon) / 2;
    const radius = Math.max(2000, haversineNm(oLat, oLon, dLat, dLon) * 1852 / 2);
    const q = `[out:json][timeout:8];(way(around:${Math.round(radius)},${midLat.toFixed(4)},${midLon.toFixed(4)})[seamark:type~"^(restricted_area|rock|obstruction|wreck|shoal)$"];relation(around:${Math.round(radius)},${midLat.toFixed(4)},${midLon.toFixed(4)})[seamark:type~"^(restricted_area|shoal)$"];);out geom;`;
    try {
        const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
        const d = await r.json();
        return (d.elements || []).filter(e => e.geometry?.length >= 3).map(e => {
            const coords = e.geometry.map(pt => [pt.lon, pt.lat]);
            if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) coords.push(coords[0]);
            return turf.polygon([coords]);
        });
    } catch (_) { return []; }
}

function _computeBypassPoint(line, hazard, marginNm) {
    try {
        const center = turf.centroid(hazard);
        const buffered = turf.buffer(hazard, marginNm, { units: 'nauticalmiles' });
        // Find the closest boundary point on the buffered polygon, then project perpendicular
        const lineCoords = line.geometry.coordinates;
        const midPt = turf.midpoint(turf.point(lineCoords[0]), turf.point(lineCoords[lineCoords.length - 1]));
        const bearingToCenter = turf.bearing(midPt, center);
        const perpBearing = (bearingToCenter + 90) % 360;
        const bypass = turf.destination(center, marginNm + 0.1, perpBearing, { units: 'nauticalmiles' });
        return bypass.geometry.coordinates;
    } catch (_) { return null; }
}

async function _fetchChannelWaypoints(dLat, dLon) {
    const q = `[out:json][timeout:8];node(around:3000,${dLat.toFixed(4)},${dLon.toFixed(4)})[seamark:type=buoy_lateral];out;`;
    try {
        const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
        const d = await r.json();
        const buoys = (d.elements || []).map(e => ({
            lat: e.lat, lon: e.lon,
            colour: (e.tags?.['seamark:buoy_lateral:colour'] || e.tags?.['seamark:colour'] || '').toLowerCase(),
        }));
        const reds   = buoys.filter(b => b.colour.includes('red') || b.colour === 'r');
        const greens = buoys.filter(b => b.colour.includes('green') || b.colour === 'g');
        if (!reds.length || !greens.length) return [];

        // Sort both from farthest to closest to destination (approach order)
        const sortByDist = (arr) => arr.sort((a, b) =>
            haversineNm(b.lat, b.lon, dLat, dLon) - haversineNm(a.lat, a.lon, dLat, dLon));
        sortByDist(reds); sortByDist(greens);

        const pairs = Math.min(reds.length, greens.length, 3);
        const wps = [];
        for (let i = 0; i < pairs; i++) {
            wps.push([(reds[i].lon + greens[i].lon) / 2, (reds[i].lat + greens[i].lat) / 2]);
        }
        return wps;
    } catch (_) { return []; }
}

async function _checkWeather(segments) {
    const warnings = {};
    for (const seg of segments) {
        const [lon, lat] = seg.from;
        try {
            const r = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=wave_height,wave_direction,wind_speed_10m&forecast_days=1`);
            const d = await r.json();
            const waves = d.hourly?.wave_height?.[0] || 0;
            const wind  = d.hourly?.wind_speed_10m?.[0] || 0;
            const warnLevel = waves > 2 ? 'red' : wind > 38 ? 'orange' : null; // 38 km/h ≈ BFT 6
            if (warnLevel) warnings[seg.name] = { level: warnLevel, waves: waves.toFixed(1), wind: wind.toFixed(0) };
        } catch (_) {}
    }
    return warnings;
}

function _drawRoutePlanLine(coords) {
    // Remove old route plan lines
    _rp.lineIds.forEach(id => { if (mapa.getLayer(id)) mapa.removeLayer(id); if (mapa.getSource(id)) mapa.removeSource(id); });
    _rp.lineIds = [];
    if (!mapLayersReady || coords.length < 2) return;
    const srcId = 'rp-line-src', lyrId = 'rp-line-lyr';
    mapa.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    mapa.addLayer({ id: lyrId, type: 'line', source: srcId, paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-opacity': 0.9, 'line-dasharray': [5, 3] } });
    _rp.lineIds = [srcId, lyrId];
}

function _displayRoutePlanResults(segments, warnings) {
    const segEl  = document.getElementById('rp-segments');
    const totEl  = document.getElementById('rp-total');
    const actEl  = document.getElementById('rp-actions');
    if (!segEl) return;

    segEl.innerHTML = '';
    let totalNm = 0;
    segments.forEach(seg => {
        totalNm += seg.dist;
        const w = warnings[seg.name];
        const warnClass = w ? (w.level === 'red' ? 'warn-red' : 'warn-orange') : '';
        const warnBadge = w
            ? `<div class="rp-warn ${w.level}">⚠ Olas ${w.waves}m · Viento ${w.wind} km/h</div>`
            : '';
        const div = document.createElement('div');
        div.className = `rp-segment ${warnClass}`;
        div.innerHTML = `
            <div class="rp-seg-head">
                <span>${seg.name}</span>
                <span style="color:var(--ink-3);font-size:8px">${seg.bearing}°T</span>
            </div>
            <div class="rp-seg-meta">
                <span><span class="lk">RUMBO</span>${seg.bearing}°T</span>
                <span><span class="lk">DIST</span>${seg.dist.toFixed(2)} nm</span>
            </div>
            ${warnBadge}`;
        segEl.appendChild(div);
    });

    if (totEl) { totEl.textContent = `TOTAL: ${totalNm.toFixed(2)} nm`; totEl.style.display = 'block'; }
    if (actEl) actEl.style.display = 'flex';
    _setRPHint('Ruta calculada');
}

function exportRoutePlanGPX() {
    if (!_rp.result) return;
    const { coords, segments } = _rp.result;
    const now = new Date().toISOString();
    const wpts = coords.map((c, i) => `  <wpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}">\n    <name>${segments[i]?.name || `WP-${i}`}</name>\n  </wpt>`).join('\n');
    const trkpts = coords.map(c => `      <trkpt lat="${c[1].toFixed(6)}" lon="${c[0].toFixed(6)}"/>`).join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Gyreo" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>Gyreo Route Plan</name><time>${now}</time></metadata>\n${wpts}\n  <trk><name>Ruta Planificada Gyreo</name><trkseg>\n${trkpts}\n  </trkseg></trk>\n</gpx>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
    a.download = `gyreo_plan_${now.slice(0, 10)}.gpx`;
    a.click();
}
