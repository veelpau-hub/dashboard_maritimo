const DASH_LABELS = {
    meteo:'METEOROLOGÍA', oleaje:'OLEAJE Y CORRIENTES', mareas:'MAREAS',
    ais:'TRÁFICO MARÍTIMO (AIS)', alertas:'ALERTAS Y AVISOS',
    prediccion:'PREDICCIÓN 7 DÍAS', calidad:'CALIDAD DEL AIRE',
    vigilancia:'VIGILANCIA MARÍTIMA', pesca:'CONDICIONES DE PESCA',
};

const WX_ICONS = {
    0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',48:'🌫',51:'🌦',53:'🌦',
    55:'🌧',61:'🌧',63:'🌧',65:'🌧',71:'❄️',73:'❄️',75:'❄️',
    80:'🌦',81:'🌧',82:'⛈️',95:'⛈️',96:'⛈️',99:'⛈️'
};

let currentDashTab = null;

function switchDashTab(tab) {
    currentDashTab = tab;
    const label = DASH_LABELS[tab] || 'DASHBOARD';
    const isLive = tab === 'ais' || tab === 'vigilancia';
    const labelEl = document.getElementById('dash-tab-label');
    if (labelEl) {
        if (isLive) {
            labelEl.innerHTML = label + ' <span class="live-badge"><span class="live-dot"></span>LIVE</span>';
        } else {
            labelEl.textContent = label;
        }
    }
    document.querySelectorAll('.submenu-btn').forEach(b => b.classList.remove('active'));
    const idx = Object.keys(DASH_LABELS).indexOf(tab);
    if (idx >= 0) document.querySelectorAll('.submenu-btn')[idx].classList.add('active');

    const content = document.getElementById('dash-content');
    // Skeleton loading
    content.innerHTML = `
        <div class="dash-skeleton" style="height:50px"></div>
        <div class="dash-skeleton" style="height:100px"></div>
        <div class="dash-skeleton" style="height:70px"></div>`;

    const coordAware = ['meteo','oleaje','prediccion'];
    let url = `/api/dashboard/${tab}`;
    if (window.geoCoords && coordAware.includes(tab))
        url += `?lat=${window.geoCoords.lat}&lon=${window.geoCoords.lon}`;

    fetch(url)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(data => {
            const fn = renders[tab];
            if (fn) fn(data, content);
            // Add timestamp
            const ts = document.createElement('div');
            ts.className = 'data-ts';
            ts.textContent = `Actualizado: ${new Date().toLocaleTimeString('es-ES')}`;
            content.appendChild(ts);
        })
        .catch(err => {
            content.innerHTML = `<p style="color:#ef4444;padding:1rem">Error cargando datos: ${esc(String(err))}</p>`;
        });
}

const renders = {
    meteo: renderMeteo, oleaje: renderOleaje, mareas: renderMareas,
    ais: renderAIS, alertas: renderAlertas, prediccion: renderPrediccion, calidad: renderCalidad,
    vigilancia: renderVigilancia, pesca: renderPesca,
};

// --- Escape helper to prevent XSS from external data ---
function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
}

function renderMeteo(data, el) {
    const step = 3;
    const horas = (data.time||[]).filter((_,i) => i%step===0).map(t => t.substr(11,5));
    const temps = (data.temp||[]).filter((_,i) => i%step===0);
    const winds = (data.wind||[]).filter((_,i) => i%step===0);
    el.innerHTML = `
        <p class="dash-section-title">Temperatura y viento — 7 días</p>
        <div class="dash-chart-container" id="chart-temp" style="height:160px"></div>
        <div class="dash-chart-container" id="chart-wind" style="height:140px"></div>`;
    requestAnimationFrame(() => {
        drawLineChart('#chart-temp', horas, temps, '°C', '#4AC8E8');
        drawLineChart('#chart-wind', horas, winds, 'km/h', '#f59e0b');
        observeChart('#chart-temp');
        observeChart('#chart-wind');
    });
}

function renderOleaje(data, el) {
    const step = 3;
    const horas = (data.time||[]).filter((_,i) => i%step===0).map(t => t.substr(11,5));
    const heights = (data.height||[]).filter((_,i) => i%step===0);
    const current = (data.height||[])[new Date().getHours()] ?? (data.height||[])[0];
    const tempAgua = data.temp_agua ? data.temp_agua.find(v => v !== null) : null;
    const period = (data.period||[]).find(v=>v) ?? 0;
    // Direction for swell rose (use current direction)
    const hourIdx = new Date().getHours();
    const currentDir = (data.direction||[])[hourIdx] ?? (data.direction||[])[0] ?? 0;

    el.innerHTML = `
        <p class="dash-section-title">Oleaje — 7 días</p>
        <div class="dash-grid">
            <div class="dash-card"><div class="dash-card-label">Altura actual</div>
                <div class="dash-card-value">${(current??0).toFixed(1)}m</div></div>
            <div class="dash-card"><div class="dash-card-label">Período</div>
                <div class="dash-card-value">${period.toFixed(0)}s</div></div>
            ${tempAgua!=null?`<div class="dash-card"><div class="dash-card-label">Temp. agua</div>
                <div class="dash-card-value">${tempAgua.toFixed(1)}°</div></div>`:''}
            <div class="dash-card" style="display:flex;flex-direction:column;align-items:center">
                <div class="dash-card-label">Dirección oleaje</div>
                <div id="swell-rose-container" style="width:80px;height:80px;margin-top:4px"></div>
            </div>
        </div>
        <div class="dash-chart-container" id="chart-olas" style="height:160px"></div>`;
    requestAnimationFrame(() => {
        drawLineChart('#chart-olas', horas, heights, 'm', '#4AC8E8');
        observeChart('#chart-olas');
        drawSwellRose('#swell-rose-container', currentDir, current??0);
    });
}

function drawSwellRose(selector, dirDeg, heightM) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    const size = 78;
    const cx = size/2, cy = size/2, r = 28;
    d3.select(el).select('svg').remove();
    const svg = d3.select(el).append('svg')
        .attr('width', size).attr('height', size);

    // Background circle
    svg.append('circle').attr('cx',cx).attr('cy',cy).attr('r',r)
        .attr('fill','none').attr('stroke','rgba(255,255,255,0.1)').attr('stroke-width',1);

    // Cardinal marks
    ['N','E','S','O'].forEach((c,i) => {
        const a = (i * 90 - 90) * Math.PI / 180;
        svg.append('text')
            .attr('x', cx + (r+8)*Math.cos(a)).attr('y', cy + (r+8)*Math.sin(a)+3)
            .attr('text-anchor','middle').attr('fill', c==='N'?'#f59e0b':'rgba(255,255,255,0.3)')
            .attr('font-size','8px').text(c);
    });

    // Arrow from direction
    const rad = (dirDeg - 90) * Math.PI / 180;
    const arrowLen = r * 0.8;
    const hue = heightM < 1 ? 140 : heightM < 2 ? 50 : 0;
    const arrowColor = `hsl(${hue},85%,60%)`;
    const x2 = cx + arrowLen * Math.cos(rad);
    const y2 = cy + arrowLen * Math.sin(rad);

    svg.append('line')
        .attr('x1', cx - (arrowLen*0.3)*Math.cos(rad))
        .attr('y1', cy - (arrowLen*0.3)*Math.sin(rad))
        .attr('x2', x2).attr('y2', y2)
        .attr('stroke', arrowColor).attr('stroke-width',2.5)
        .attr('marker-end', `url(#arr-${selector.replace(/[^a-z0-9]/gi,'')})`);

    // Arrow head
    const defs = svg.append('defs');
    const markerId = `arr-${selector.replace(/[^a-z0-9]/gi,'')}`;
    const marker = defs.append('marker').attr('id', markerId)
        .attr('markerWidth',6).attr('markerHeight',6)
        .attr('refX',3).attr('refY',3).attr('orient','auto');
    marker.append('path').attr('d','M0,0 L0,6 L6,3 Z').attr('fill', arrowColor);

    // Degree label
    svg.append('text').attr('x',cx).attr('y',size-4)
        .attr('text-anchor','middle').attr('fill','rgba(255,255,255,0.4)')
        .attr('font-size','8px').text(`${Math.round(dirDeg)}°`);
}

function renderMareas(data, el) {
    const rows = (data.extremes||[]).map(e => `
        <div class="dash-card" style="flex-direction:row;align-items:center;gap:1rem;display:flex">
            <span style="font-size:1.5rem;color:${e.type==='pleamar'?'#4AC8E8':'#f59e0b'}">${e.type==='pleamar'?'↑':'↓'}</span>
            <div>
                <div class="dash-card-label">${e.type==='pleamar'?'Pleamar':'Bajamar'}</div>
                <div class="dash-card-value" style="font-size:1.1rem">${esc(e.time)}</div>
                <div class="dash-card-sub">${e.height!=null?e.height.toFixed(1)+'m':'-'}</div>
            </div>
        </div>`).join('');
    const note = data.source==='estimado'
        ? '<p style="color:rgba(255,255,255,0.25);font-size:0.7rem;margin-top:0.5rem">⚠ Datos estimados. Configura la API de Puertos del Estado para datos reales.</p>'
        : '';
    el.innerHTML = `
        <p class="dash-section-title">Mareas — hoy</p>
        <div class="dash-grid">${rows}</div>
        <div class="dash-chart-container" id="chart-mareas" style="height:140px"></div>
        ${note}`;
    requestAnimationFrame(() => {
        drawTideCurve('#chart-mareas', data.extremes||[]);
    });
}

function drawTideCurve(selector, extremes) {
    const el = document.querySelector(selector);
    if (!el || extremes.length < 2) return;
    const m={top:10,right:10,bottom:30,left:35};
    const W=el.clientWidth-m.left-m.right, H=el.clientHeight-m.top-m.bottom;
    if (W<=0||H<=0) return;
    d3.select(selector).select('svg').remove();
    const svg=d3.select(selector).append('svg')
        .attr('width',el.clientWidth).attr('height',el.clientHeight)
        .append('g').attr('transform',`translate(${m.left},${m.top})`);
    // Build synthetic tide data using cosine interpolation between extremes
    const points = [];
    for (let i=0; i<extremes.length-1; i++) {
        const e1 = extremes[i], e2 = extremes[i+1];
        try {
            const t1 = parseTime(e1.time), t2 = parseTime(e2.time);
            const h1 = e1.height, h2 = e2.height;
            for (let step=0; step<=20; step++) {
                const t = t1 + (t2-t1)*(step/20);
                const frac = step/20;
                const h = h1 + (h2-h1) * (1 - Math.cos(frac*Math.PI)) / 2;
                points.push({t, h});
            }
        } catch(e){}
    }
    if (!points.length) return;
    const now = new Date().getHours()*60+new Date().getMinutes();
    const x=d3.scaleLinear().domain([0,1440]).range([0,W]);
    const allH = points.map(p=>p.h);
    const y=d3.scaleLinear().domain([0, Math.max(...allH)*1.1]).range([H,0]);
    const area=d3.area().x(p=>x(p.t)).y0(H).y1(p=>y(p.h)).curve(d3.curveCatmullRom);
    const line=d3.line().x(p=>x(p.t)).y(p=>y(p.h)).curve(d3.curveCatmullRom);
    const grad=svg.append('defs').append('linearGradient').attr('id','tideGrad')
        .attr('gradientUnits','userSpaceOnUse').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',H);
    grad.append('stop').attr('offset','0%').attr('stop-color','#4AC8E8').attr('stop-opacity',0.3);
    grad.append('stop').attr('offset','100%').attr('stop-color','#4AC8E8').attr('stop-opacity',0);
    svg.append('path').datum(points).attr('fill','url(#tideGrad)').attr('d',area);
    svg.append('path').datum(points).attr('fill','none').attr('stroke','#4AC8E8')
        .attr('stroke-width',1.5).attr('d',line);
    // Current time line
    svg.append('line').attr('x1',x(now)).attr('y1',0).attr('x2',x(now)).attr('y2',H)
        .attr('stroke','rgba(255,255,255,0.4)').attr('stroke-width',1).attr('stroke-dasharray','3,3');
    // Time axis (every 6h)
    svg.append('g').attr('transform',`translate(0,${H})`)
        .call(d3.axisBottom(x).tickValues([0,360,720,1080,1440])
            .tickFormat(v=>`${Math.floor(v/60).toString().padStart(2,'0')}:00`))
        .selectAll('text').attr('fill','rgba(255,255,255,0.35)').attr('font-size','9px');
    svg.append('g').call(d3.axisLeft(y).ticks(3).tickFormat(v=>v+'m'))
        .selectAll('text').attr('fill','rgba(255,255,255,0.35)').attr('font-size','9px');
    svg.selectAll('.domain,.tick line').attr('stroke','rgba(255,255,255,0.06)');
}

function parseTime(t) {
    const p = (t||'').split(':');
    return parseInt(p[0]||0)*60+parseInt(p[1]||0);
}

function renderAIS(data, el) {
    if (data.note) { el.innerHTML=`<p style="color:rgba(255,255,255,0.35);padding:1rem">${esc(data.note)}</p>`; return; }
    const vessels = data.vessels||[];
    if (!vessels.length) { el.innerHTML='<p style="color:rgba(255,255,255,0.35);padding:1rem">Sin buques detectados en el área.</p>'; return; }
    const rows = vessels.map(v=>`<tr>
        <td>${esc(v.name)}</td><td>${esc(String(v.type||'-'))}</td>
        <td>${v.speed!=null?v.speed.toFixed(1)+' kt':'-'}</td>
        <td>${v.course!=null?v.course+'°':'-'}</td>
        <td style="font-size:0.7rem;color:rgba(255,255,255,0.45)">${v.destination?esc(v.destination):'-'}</td>
        <td><a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${esc(String(v.mmsi||'').replace(/[^0-9]/g,''))}" target="_blank" style="color:#4AC8E8;font-size:0.7rem">${esc(String(v.mmsi||''))}</a></td>
        </tr>`).join('');
    el.innerHTML = `
        <p class="dash-section-title">Buques en el área de Rota (~5 min retraso)</p>
        <div class="ais-table-wrap"><table class="ais-table">
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Vel.</th><th>Rumbo</th><th>Destino</th><th>MMSI</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`;
}

function renderAlertas(data, el) {
    if (data.note) { el.innerHTML=`<p style="color:rgba(255,255,255,0.35);padding:1rem">${esc(data.note)}</p>`; return; }
    const alertas = data.alertas||[];
    if (!alertas.length) {
        el.innerHTML=`<p class="dash-section-title">Alertas activas — Cádiz</p>
            <div class="alert-card verde"><div class="alert-title">Sin alertas activas</div>
            <div class="alert-desc">No hay avisos meteorológicos en vigor para la provincia de Cádiz.</div></div>`;
        return;
    }
    // Sanitize nivel to known values only
    const safeNivel = (n) => ['verde','amarillo','naranja','rojo'].includes(n) ? n : 'verde';
    const cards = alertas.map(a=>`<div class="alert-card ${safeNivel(a.nivel)}">
        <div class="alert-title">${esc(a.titulo)}</div>
        <div class="alert-desc">${esc(a.descripcion)}</div>
        <div class="alert-desc" style="margin-top:.25rem">${esc(a.inicio)} → ${esc(a.fin)}</div></div>`).join('');
    el.innerHTML=`<p class="dash-section-title">Alertas activas — Cádiz</p>${cards}`;
}

function renderPrediccion(data, el) {
    const dias=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    const days=(data.days||[]).map(d=>{
        const nombre=dias[new Date(d.date+'T12:00:00').getDay()];
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
    // UV protection recommendations
    const uv = data.uv || 0;
    let uvLabel, uvColor, uvRec;
    if (uv < 3) { uvLabel='Bajo'; uvColor='#22c55e'; uvRec='Sin protección necesaria'; }
    else if (uv < 6) { uvLabel='Moderado'; uvColor='#f59e0b'; uvRec='Protector SPF 30+'; }
    else if (uv < 8) { uvLabel='Alto'; uvColor='#f97316'; uvRec='SPF 50+, gorra, gafas'; }
    else if (uv < 11) { uvLabel='Muy alto'; uvColor='#ef4444'; uvRec='SPF 50+, protección total'; }
    else { uvLabel='Extremo'; uvColor='#9333ea'; uvRec='Evitar exposición directa'; }

    el.innerHTML=`
        <p class="dash-section-title">Calidad del aire — ahora</p>
        <div class="dash-grid">
            <div class="dash-card"><div class="dash-card-label">Índice AQI</div>
                <div class="dash-card-value" style="color:${color}">${aqi}</div>
                <div class="dash-card-sub">${label}</div></div>
            <div class="dash-card">
                <div class="dash-card-label">Índice UV</div>
                <div class="dash-card-value" style="color:${uvColor}">${uv.toFixed(1)}</div>
                <div class="dash-card-sub" style="color:${uvColor}">${uvLabel}</div>
                <div class="dash-card-sub" style="font-size:0.68rem;margin-top:0.3rem">☀ ${esc(uvRec)}</div>
            </div>
            <div class="dash-card"><div class="dash-card-label">PM2.5</div>
                <div class="dash-card-value" style="font-size:1.1rem">${data.pm25?.toFixed(1)||'-'} μg/m³</div></div>
            <div class="dash-card"><div class="dash-card-label">PM10</div>
                <div class="dash-card-value" style="font-size:1.1rem">${data.pm10?.toFixed(1)||'-'} μg/m³</div></div>
            <div class="dash-card"><div class="dash-card-label">Ozono</div>
                <div class="dash-card-value" style="font-size:1.1rem">${data.ozone?.toFixed(0)||'-'} μg/m³</div></div>
        </div>`;
}

// =================== VIGILANCIA ===================
function renderVigilancia(data, el) {
    const vessels = data.vessels || [];
    const outOfRange = data.out_of_range || [];

    const threatBadge = (t) => {
        const colors = {ROJO:'#ef4444',AMARILLO:'#f59e0b',VERDE:'#22c55e'};
        return `<span style="background:${colors[t]||'#888'};color:white;font-size:0.6rem;padding:2px 7px;border-radius:10px;font-weight:700">${esc(t)}</span>`;
    };
    const statusBadge = (s) => {
        const colors = {'EN MOVIMIENTO':'#4AC8E8','FONDEADO':'#84cc16','DESCONOCIDO':'rgba(255,255,255,0.3)'};
        return `<span style="color:${colors[s]||'#aaa'};font-size:0.7rem">${esc(s)}</span>`;
    };

    const summary = `
        <div class="dash-grid" style="margin-bottom:1rem">
            <div class="dash-card"><div class="dash-card-label">Total buques</div><div class="dash-card-value">${data.total||0}</div></div>
            <div class="dash-card"><div class="dash-card-label" style="color:#ef4444">ROJO</div><div class="dash-card-value" style="color:#ef4444">${data.rojo||0}</div></div>
            <div class="dash-card"><div class="dash-card-label" style="color:#f59e0b">AMARILLO</div><div class="dash-card-value" style="color:#f59e0b">${data.amarillo||0}</div></div>
            <div class="dash-card"><div class="dash-card-label" style="color:#22c55e">VERDE</div><div class="dash-card-value" style="color:#22c55e">${data.verde||0}</div></div>
        </div>`;

    const rozInfo = data.roz ? `<div class="alert-card" style="border-color:#ef4444;background:rgba(239,68,68,0.05);margin-bottom:0.75rem">
        <div class="alert-title">🚫 Zona ROZ — Base Naval Rota</div>
        <div class="alert-desc">Radio ${data.roz.radius_nm}nm desde ${data.roz.lat}°N ${Math.abs(data.roz.lon)}°W. Activa en mapa (toggle "Zona ROZ").</div>
    </div>` : '';

    let vesselRows = '';
    if (!vessels.length) {
        vesselRows = '<p style="color:rgba(255,255,255,0.35);font-size:0.85rem;padding:0.5rem 0">Sin buques en el área de vigilancia.</p>';
    } else {
        vesselRows = vessels.map(v => `
            <tr>
                <td>${esc(v.name)}</td>
                <td>${threatBadge(v.amenaza)}</td>
                <td>${statusBadge(v.estado)}</td>
                <td>${v.speed != null ? esc(v.speed.toFixed(1)) + ' kt' : '-'}</td>
                <td style="font-size:0.7rem;color:rgba(255,255,255,0.4)">${esc(String(v.mmsi||''))}</td>
            </tr>`).join('');
        vesselRows = `<div style="overflow-x:auto"><table class="ais-table">
            <thead><tr><th>Nombre</th><th>Amenaza</th><th>Estado</th><th>SOG</th><th>MMSI</th></tr></thead>
            <tbody>${vesselRows}</tbody></table></div>`;
    }

    let oorSection = '';
    if (outOfRange.length) {
        const rows = outOfRange.map(v => `
            <div class="alert-card" style="border-color:#f59e0b;background:rgba(245,158,11,0.06)">
                <div class="alert-title">📡 FUERA DE RANGO — ${esc(v.name)}</div>
                <div class="alert-desc">Última vez visto: ${esc(v.last_seen)} | Velocidad: ${v.last_speed?.toFixed(1)} kt | ${threatBadge(v.amenaza)}</div>
            </div>`).join('');
        oorSection = `<p class="dash-section-title" style="margin-top:1rem">Buques fuera de rango</p>${rows}`;
    }

    el.innerHTML = `
        <p class="dash-section-title">Estado — Bahía de Cádiz / ROZ Rota</p>
        ${rozInfo}${summary}
        <p class="dash-section-title">Seguimiento multi-buque</p>
        ${vesselRows}${oorSection}`;
}

// =================== PESCA ===================
function renderPesca(data, el) {
    const idx = data.fishing_index || 0;
    const idxColor = idx <= 3 ? '#ef4444' : idx <= 6 ? '#f59e0b' : '#22c55e';
    const gn = data.go_nogo || {};
    const goColor = gn.go ? '#22c55e' : '#ef4444';
    const goText = gn.go ? 'SI PUEDES SALIR' : 'NO SALGAS';
    const moon = data.moon || {};
    const hours = (data.best_hours || []).slice(0, 6);
    const species = data.species_in_season || [];
    const tempAgua = data.temp_agua_current;
    const solunar = data.solunar || [];

    const speciesIcons = {
        'Dorada':'🐡','Lubina':'🐟','Atún':'🐟','Pargo':'🐠','Boquerón':'🐟',
        'Caballa':'🐟','Lenguado':'🫓','Choco':'🦑','Gamba':'🦐','Langostino':'🦞',
        'Pez espada':'🐟','Dentón':'🐡'
    };
    const speciesCards = species.map(s =>
        `<div class="dash-card" style="text-align:center;padding:0.6rem">
            <div style="font-size:1.2rem">${speciesIcons[s]||'🐟'}</div>
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.8);margin-top:0.25rem">${esc(s)}</div>
            <div style="font-size:0.6rem;color:#22c55e;margin-top:0.1rem">EN TEMPORADA</div>
         </div>`).join('');

    const hoursHtml = hours.map(h =>
        `<span style="background:rgba(74,200,232,0.12);border:1px solid rgba(74,200,232,0.25);border-radius:6px;padding:3px 10px;font-size:0.78rem;color:#4AC8E8">${esc(h)}</span>`
    ).join(' ');

    const reasonsOk = (data.reasons_ok||[]).map(r => `<div style="color:#22c55e;font-size:0.75rem">✓ ${esc(r)}</div>`).join('');
    const reasonsBad = (data.reasons_bad||[]).map(r => `<div style="color:#ef4444;font-size:0.75rem">✗ ${esc(r)}</div>`).join('');

    // Sparkline de temp agua
    const sparkData = data.temp_agua_sparkline || [];
    const sparkEl = `<div class="dash-chart-container" id="chart-temp-agua" style="height:80px"></div>`;

    // Solunar periods
    const solunarHtml = solunar.map(s => {
        const isMajor = s.type === 'mayor';
        const color = isMajor ? '#f59e0b' : '#4AC8E8';
        const badge = isMajor ? '★★ MAYOR' : '★ menor';
        return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.35rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span style="font-size:0.9rem;color:${color};font-weight:700;min-width:38px">${esc(s.time)}</span>
            <span style="font-size:0.65rem;color:${color}">${badge}</span>
            <span style="font-size:0.7rem;color:rgba(255,255,255,0.4)">${esc(s.label||'')} · ${s.duration||0}min</span>
        </div>`;
    }).join('');

    el.innerHTML = `
        <p class="dash-section-title">Condiciones de pesca — Bahía de Cádiz</p>

        <div class="dash-grid" style="margin-bottom:1rem">
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label">Índice de pesca</div>
                <div style="font-size:3rem;font-weight:700;color:${idxColor};line-height:1.1">${idx}</div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.4)">/10</div>
            </div>
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label">¿Puedo salir hoy?</div>
                <div style="font-size:1.4rem;font-weight:700;color:${goColor};margin:0.3rem 0">${goText}</div>
                ${gn.limiter ? `<div style="font-size:0.7rem;color:#f59e0b">⚠ ${esc(gn.limiter)}</div>` : '<div style="font-size:0.7rem;color:#22c55e">Condiciones favorables</div>'}
            </div>
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label">Fase lunar</div>
                <div style="font-size:2rem;margin:0.2rem 0">${esc(moon.icon||'')}</div>
                <div style="font-size:0.78rem;color:rgba(255,255,255,0.7)">${esc(moon.name||'')}</div>
                <div style="font-size:0.65rem;color:rgba(255,255,255,0.35)">Día ${moon.days||0} del ciclo</div>
            </div>
            ${tempAgua ? `<div class="dash-card" style="text-align:center">
                <div class="dash-card-label">Temp. agua</div>
                <div class="dash-card-value">${tempAgua}°C</div>
            </div>` : ''}
        </div>

        ${reasonsOk || reasonsBad ? `<div class="dash-card" style="margin-bottom:0.75rem">
            <div class="dash-card-label">Factores de condición</div>
            <div style="margin-top:0.4rem">${reasonsOk}${reasonsBad}</div>
        </div>` : ''}

        ${solunar.length ? `<div class="dash-card" style="margin-bottom:0.75rem">
            <div class="dash-card-label">Períodos solunares hoy</div>
            <div style="margin-top:0.4rem">${solunarHtml}</div>
            <div style="font-size:0.62rem;color:rgba(255,255,255,0.2);margin-top:0.4rem">Teoría solunar de John Alden Knight — aproximación astronómica</div>
        </div>` : ''}

        <div class="dash-card" style="margin-bottom:0.75rem">
            <div class="dash-card-label">Mejores horas del día</div>
            <div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.4rem">${hoursHtml||'<span style="color:rgba(255,255,255,0.3);font-size:0.8rem">Calculando...</span>'}</div>
            <div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:0.4rem">Basado en cambios de marea y amanecer/atardecer</div>
        </div>

        ${sparkData.length ? `<p class="dash-section-title">Temperatura del agua (últimas lecturas)</p>${sparkEl}` : ''}

        <p class="dash-section-title">Especies en temporada — Bahía de Cádiz</p>
        <div class="dash-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">${speciesCards}</div>`;

    if (sparkData.length) {
        requestAnimationFrame(() => {
            const labels = sparkData.map((_,i) => `T${i}`);
            drawLineChart('#chart-temp-agua', labels, sparkData, '°C', '#4AC8E8');
        });
    }
}

function drawLineChart(selector, labels, values, unit, color) {
    const el = document.querySelector(selector);
    if (!el||!values?.length) return;
    const m={top:10,right:10,bottom:30,left:35};
    const w=el.clientWidth-m.left-m.right, h=el.clientHeight-m.top-m.bottom;
    if (w <= 0 || h <= 0) return;
    d3.select(selector).select('svg').remove();
    const svg=d3.select(selector).append('svg')
        .attr('width',el.clientWidth).attr('height',el.clientHeight)
        .append('g').attr('transform',`translate(${m.left},${m.top})`);
    const x=d3.scalePoint().domain(labels).range([0,w]);
    const minV=d3.min(values)||0, maxV=d3.max(values)||1;
    const y=d3.scaleLinear().domain([minV*0.95,maxV*1.05]).range([h,0]);
    const gradId=`g${selector.replace(/\W/g,'')}`;
    const defs=svg.append('defs');
    const grad=defs.append('linearGradient').attr('id',gradId)
        .attr('gradientUnits','userSpaceOnUse').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',h);
    grad.append('stop').attr('offset','0%').attr('stop-color',color).attr('stop-opacity',0.25);
    grad.append('stop').attr('offset','100%').attr('stop-color',color).attr('stop-opacity',0);
    const area=d3.area().x((_,i)=>x(labels[i])||0).y0(h).y1(d=>y(d)).curve(d3.curveCatmullRom);
    const line=d3.line().x((_,i)=>x(labels[i])||0).y(d=>y(d)).curve(d3.curveCatmullRom);
    svg.append('path').datum(values).attr('fill',`url(#${gradId})`).attr('d',area);
    svg.append('path').datum(values).attr('fill','none').attr('stroke',color).attr('stroke-width',1.5).attr('d',line);
    const every=Math.max(1,Math.floor(labels.length/8));
    svg.append('g').attr('transform',`translate(0,${h})`)
        .call(d3.axisBottom(x).tickValues(labels.filter((_,i)=>i%every===0)))
        .selectAll('text').attr('fill','rgba(255,255,255,0.35)').attr('font-size','9px');
    svg.append('g').call(d3.axisLeft(y).ticks(4))
        .selectAll('text').attr('fill','rgba(255,255,255,0.35)').attr('font-size','9px');
    svg.selectAll('.domain,.tick line').attr('stroke','rgba(255,255,255,0.08)');
    // Store chart data for ResizeObserver redraws
    el._chartData = {labels, values, unit, color};
}

// ResizeObserver: redraws all D3 charts when container resizes
const _chartResizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
        const el = entry.target;
        const d = el._chartData;
        if (d) {
            const sel = `#${el.id}`;
            if (sel !== '#') drawLineChart(sel, d.labels, d.values, d.unit, d.color);
        }
    }
});

function observeChart(selector) {
    const el = document.querySelector(selector);
    if (el) _chartResizeObserver.observe(el);
}
