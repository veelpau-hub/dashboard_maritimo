const DASH_LABELS = {
    hoy:'VENTANA METEOROLÓGICA HOY',
    meteo:'METEOROLOGÍA', oleaje:'OLEAJE Y CORRIENTES', mareas:'MAREAS',
    ais:'TRÁFICO MARÍTIMO (AIS)', alertas:'ALERTAS Y AVISOS',
    prediccion:'PREDICCIÓN 7 DÍAS', calidad:'CALIDAD DEL AIRE',
    vigilancia:'VIGILANCIA MARÍTIMA', pesca:'CONDICIONES DE PESCA',
    manana:'VENTANA METEOROLÓGICA MAÑANA',
    corrientes:'CORRIENTES OCEÁNICAS',
    historial:'HISTORIAL DE CONDICIONES',
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
    hoy: renderHoy,
    meteo: renderMeteo, oleaje: renderOleaje, mareas: renderMareas,
    ais: renderAIS, alertas: renderAlertas, prediccion: renderPrediccion, calidad: renderCalidad,
    vigilancia: renderVigilancia, pesca: renderPesca,
    manana: renderManana, corrientes: renderCorrientes,
    historial: renderHistorial,
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
    const precips = (data.precip||[]).filter((_,i) => i%step===0);
    const pressures = (data.pressure||[]).filter((_,i) => i%step===0);
    const humidities = (data.humidity||[]).filter((_,i) => i%step===0);

    // Current conditions from current object if available
    const cur = data.current || {};
    const curTemp = cur.temp != null ? cur.temp.toFixed(1) : (temps[0] != null ? temps[0].toFixed(1) : '-');
    const curApparent = cur.apparent_temp != null ? cur.apparent_temp.toFixed(1) : '-';
    const curWind = cur.wind != null ? cur.wind.toFixed(0) : (winds[0] != null ? winds[0].toFixed(0) : '-');
    const curPress = cur.pressure != null ? cur.pressure.toFixed(0) : (pressures[0] != null ? pressures[0].toFixed(0) : '-');
    const curHumidity = cur.humidity != null ? cur.humidity.toFixed(0) : '-';
    const curVisKm = cur.visibility_m != null ? (cur.visibility_m/1000).toFixed(1) : '-';
    const totalPrecip = precips.reduce((a,b) => a + (b||0), 0).toFixed(1);
    const icon = WX_ICONS[cur.code] || '🌡';

    el.innerHTML = `
        <p class="dash-section-title">Meteorología — ahora + 7 días</p>
        <div class="dash-grid" style="margin-bottom:0.75rem">
            <div class="dash-card" style="text-align:center">
                <div style="font-size:2rem">${icon}</div>
                <div class="dash-card-value">${curTemp}°C</div>
                <div class="dash-card-sub">Sensación ${curApparent}°C</div>
            </div>
            <div class="dash-card"><div class="dash-card-label">Viento</div><div class="dash-card-value">${curWind} km/h</div></div>
            <div class="dash-card"><div class="dash-card-label">Presión</div><div class="dash-card-value">${curPress} hPa</div></div>
            <div class="dash-card"><div class="dash-card-label">Humedad</div><div class="dash-card-value">${curHumidity}%</div></div>
            <div class="dash-card"><div class="dash-card-label">Visibilidad</div><div class="dash-card-value">${curVisKm} km</div></div>
            <div class="dash-card"><div class="dash-card-label">Precip. 7d</div><div class="dash-card-value" style="font-size:1.1rem">${totalPrecip} mm</div></div>
        </div>
        <div class="dash-chart-container" id="chart-temp" style="height:130px"></div>
        <div class="dash-chart-container" id="chart-wind" style="height:110px"></div>
        <div class="dash-chart-container" id="chart-press" style="height:90px"></div>`;
    requestAnimationFrame(() => {
        drawLineChart('#chart-temp', horas, temps, '°C', '#4AC8E8');
        drawLineChart('#chart-wind', horas, winds, 'km/h', '#f59e0b');
        drawLineChart('#chart-press', horas, pressures, 'hPa', '#a78bfa');
        observeChart('#chart-temp');
        observeChart('#chart-wind');
        observeChart('#chart-press');
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

    // Wave energy category
    const waveEnergy = current != null ? (current * current) * (period > 0 ? period : 1) : 0;
    const waveCat = waveEnergy < 2 ? {label:'Calma', color:'#22c55e'} :
                    waveEnergy < 8 ? {label:'Moderado', color:'#f59e0b'} :
                    {label:'Fuerte', color:'#ef4444'};

    el.innerHTML = `
        <p class="dash-section-title">Oleaje — 7 días</p>
        <div class="dash-grid">
            <div class="dash-card"><div class="dash-card-label">Altura actual</div>
                <div class="dash-card-value">${(current??0).toFixed(1)}m</div>
                <div class="dash-card-sub" style="color:${waveCat.color}">${waveCat.label}</div>
            </div>
            <div class="dash-card" style="position:relative;overflow:hidden">
                <div class="dash-card-label">Período</div>
                <div class="dash-card-value">${period.toFixed(0)}s</div>
                <div class="dash-card-sub">entre olas</div>
                <div id="wave-pulse" style="position:absolute;inset:0;border-radius:10px;background:rgba(74,200,232,0.06);transform:scale(0);animation:wavePulse ${period.toFixed(1)}s ease-in-out infinite"></div>
            </div>
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
    const coef = data.coeficiente;
    const coefColor = coef == null ? 'rgba(255,255,255,0.3)'
        : coef >= 90 ? '#ef4444' : coef >= 70 ? '#f59e0b' : coef >= 50 ? '#22c55e' : '#4AC8E8';
    const coefLabel = coef == null ? '?'
        : coef >= 90 ? 'Viva máxima' : coef >= 70 ? 'Viva' : coef >= 50 ? 'Media' : 'Muerta';

    const coefCard = coef != null ? `<div class="dash-card" style="text-align:center">
        <div class="dash-card-label">Coeficiente</div>
        <div class="dash-card-value" style="color:${coefColor}">${coef}</div>
        <div class="dash-card-sub" style="color:${coefColor}">${coefLabel}</div>
        <div class="dash-card-sub">/120</div>
    </div>` : '';

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
        <div class="dash-grid">${coefCard}${rows}</div>
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

let _aisAllVessels = [];

function renderAIS(data, el) {
    if (data.note) { el.innerHTML=`<p style="color:rgba(255,255,255,0.35);padding:1rem">${esc(data.note)}</p>`; return; }
    const vessels = data.vessels||[];
    _aisAllVessels = vessels;
    if (!vessels.length) { el.innerHTML='<p style="color:rgba(255,255,255,0.35);padding:1rem">Sin buques detectados en el área.</p>'; return; }

    el.innerHTML = `
        <p class="dash-section-title">Buques en el área de Rota (~5 min retraso) — ${vessels.length} buques</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.6rem;align-items:center">
            <input id="ais-search" placeholder="Buscar por nombre..." style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:white;padding:4px 8px;font-size:0.75rem;width:160px" oninput="filterAISTable()">
            <select id="ais-filter-speed" onchange="filterAISTable()" style="background:#0d1520;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.7);padding:4px 8px;font-size:0.73rem">
                <option value="">Todos (velocidad)</option>
                <option value="moving">En movimiento (>0.5kt)</option>
                <option value="anchored">Fondeados</option>
            </select>
            <button onclick="exportAISCSV()" style="background:rgba(74,200,232,0.08);border:1px solid rgba(74,200,232,0.2);border-radius:6px;color:#4AC8E8;font-size:0.7rem;padding:4px 10px;cursor:pointer;margin-left:auto">Exportar CSV</button>
        </div>
        <div class="ais-table-wrap"><table class="ais-table" id="ais-main-table">
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Vel.</th><th>Rumbo</th><th>Destino</th><th>MMSI</th></tr></thead>
            <tbody id="ais-tbody"></tbody></table></div>`;
    renderAISRows(vessels);
    requestAnimationFrame(() => makeSortable('ais-main-table'));
}

function filterAISTable() {
    const search = (document.getElementById('ais-search')?.value||'').toLowerCase();
    const speedFilter = document.getElementById('ais-filter-speed')?.value || '';
    let filtered = _aisAllVessels.filter(v => {
        if (search && !(v.name||'').toLowerCase().includes(search)) return false;
        if (speedFilter === 'moving' && (v.speed||0) <= 0.5) return false;
        if (speedFilter === 'anchored' && (v.speed||0) > 0.5) return false;
        return true;
    });
    renderAISRows(filtered);
}

function renderAISRows(vessels) {
    const tbody = document.getElementById('ais-tbody');
    if (!tbody) return;
    const rows = vessels.map(v=>`<tr>
        <td>${esc(v.name)}</td>
        <td style="font-size:0.7rem">${esc(v.type_name || String(v.type||'-'))}</td>
        <td>${v.speed!=null?v.speed.toFixed(1)+' kt':'-'}</td>
        <td>${v.course!=null?v.course.toFixed(0)+'°':'-'}</td>
        <td style="font-size:0.7rem;color:rgba(255,255,255,0.45)">${v.destination?esc(v.destination):'-'}</td>
        <td><a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${String(v.mmsi||'').replace(/[^0-9]/g,'')}" target="_blank" style="color:#4AC8E8;font-size:0.7rem">${esc(String(v.mmsi||''))}</a></td>
        </tr>`).join('');
    tbody.innerHTML = rows || '<tr><td colspan="6" style="color:rgba(255,255,255,0.3);text-align:center">Sin resultados</td></tr>';
}

function exportAISCSV() {
    const vessels = _aisAllVessels || [];
    if (!vessels.length) { alert('Sin buques AIS para exportar'); return; }
    const header = 'Nombre,Tipo,Velocidad_kt,Rumbo,Destino,MMSI,Lat,Lon\n';
    const rows = vessels.map(v =>
        [v.name||'', v.type_name||v.type||'', v.speed?.toFixed(1)||'',
         v.course?.toFixed(0)||'', v.destination||'', v.mmsi||'',
         v.lat?.toFixed(5)||'', v.lon?.toFixed(5)||''].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ais_buques_${new Date().toISOString().slice(0,16).replace('T','_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        // Precip bar
        const precip = d.precip || 0;
        const precipBar = precip > 0
            ? `<div style="width:100%;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;margin:3px 0">
                <div style="width:${Math.min(100,(precip/20)*100)}%;height:100%;background:#4AC8E8;border-radius:2px"></div>
               </div><div class="forecast-day-sub" style="color:#4AC8E8">${precip.toFixed(1)}mm</div>`
            : '<div class="forecast-day-sub" style="color:rgba(255,255,255,0.2)">Sin lluvia</div>';
        return `<div class="forecast-day">
            <div class="forecast-day-name">${nombre}</div>
            <div class="forecast-day-icon">${icon}</div>
            <div class="forecast-day-temp">${d.temp_max?.toFixed(0)}°</div>
            <div class="forecast-day-sub">${d.temp_min?.toFixed(0)}° mín</div>
            <div class="forecast-day-sub" style="margin-top:.3rem">💨 ${d.wind_max?.toFixed(0)} km/h</div>
            ${d.wave_max!=null?`<div class="forecast-day-sub">🌊 ${d.wave_max?.toFixed(1)}m</div>`:''}
            ${precip != null ? precipBar : ''}
            <div class="forecast-day-sub" style="font-size:0.58rem;color:rgba(255,255,255,0.2);margin-top:2px">🌅${esc(d.sunrise||'')} 🌇${esc(d.sunset||'')}</div>
            </div>`;
    }).join('');
    el.innerHTML=`<p class="dash-section-title">Predicción 7 días</p><div class="forecast-grid">${days}</div>`;
}

function renderCalidad(data, el) {
    const aqi=data.aqi||0;
    const color=aqi<20?'#22c55e':aqi<40?'#84cc16':aqi<60?'#f59e0b':aqi<80?'#f97316':'#ef4444';
    const label=aqi<20?'Muy buena':aqi<40?'Buena':aqi<60?'Moderada':aqi<80?'Mala':'Muy mala';
    // AQI gradient bar
    const aqiBarWidth = Math.min(100, (aqi / 100) * 100).toFixed(0);
    const aqiBar = `<div style="margin:0.5rem 0;background:rgba(255,255,255,0.06);border-radius:4px;height:8px;overflow:hidden">
        <div style="width:${aqiBarWidth}%;height:100%;background:linear-gradient(90deg,#22c55e,#f59e0b,#ef4444);border-radius:4px;transition:width 0.5s"></div>
    </div>`;
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
        <div class="dash-card" style="margin-bottom:0.75rem">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div><div class="dash-card-label">Índice AQI (Europeo)</div>
                <div style="font-size:2rem;font-weight:700;color:${color};line-height:1.1">${aqi}</div>
                <div class="dash-card-sub" style="color:${color}">${label}</div></div>
                <div style="font-size:0.7rem;color:rgba(255,255,255,0.35);text-align:right">0 Muy buena<br>100+ Muy mala</div>
            </div>
            ${aqiBar}
        </div>
        <div class="dash-grid">
            <div class="dash-card"><div class="dash-card-label">AQI</div>
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


// =================== HOY — VENTANA METEOROLÓGICA ===================
function renderHoy(data, el) {
    const hours = data.hours || [];
    const today = data.date || new Date().toISOString().slice(0,10);
    const nowH = new Date().getHours();

    if (!hours.length) {
        el.innerHTML = `<p class="dash-section-title">Ventana meteorológica — ${today}</p>
            <p style="color:rgba(255,255,255,0.35);padding:0.5rem">No hay datos disponibles para hoy.</p>`;
        return;
    }

    // Summary: best windows
    const best = hours.filter(h => h.score >= 8);
    const good = hours.filter(h => h.score >= 5 && h.score < 8);
    const bad = hours.filter(h => h.score < 5);

    const summaryHtml = `
        <div class="dash-grid" style="margin-bottom:0.75rem">
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label" style="color:#22c55e">Horas excelentes</div>
                <div class="dash-card-value" style="color:#22c55e">${best.length}</div>
            </div>
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label" style="color:#f59e0b">Horas aceptables</div>
                <div class="dash-card-value" style="color:#f59e0b">${good.length}</div>
            </div>
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label" style="color:#ef4444">Horas malas</div>
                <div class="dash-card-value" style="color:#ef4444">${bad.length}</div>
            </div>
        </div>`;

    // Hour timeline
    const timelineHtml = hours.map(h => {
        const hNum = parseInt(h.time.split(':')[0]);
        const isCurrent = hNum === nowH;
        const border = isCurrent ? 'border: 2px solid white;' : '';
        return `<div style="flex:1;min-width:38px;text-align:center;${border};border-radius:6px;padding:4px 2px;background:rgba(255,255,255,0.03)">
            <div style="font-size:0.6rem;color:rgba(255,255,255,0.4)">${esc(h.time)}</div>
            <div style="width:100%;height:24px;background:${esc(h.color)};opacity:${0.3+h.score/14};border-radius:3px;margin:2px 0"></div>
            <div style="font-size:0.58rem;color:rgba(255,255,255,0.4)">${h.wave_h}m</div>
            <div style="font-size:0.58rem;color:rgba(255,255,255,0.35)">${h.wind}km</div>
        </div>`;
    }).join('');

    // Best windows text
    const bestWindowsText = best.length
        ? best.map(h => esc(h.time)).slice(0,6).join(', ')
        : 'Ninguna ventana ideal hoy';

    el.innerHTML = `
        <p class="dash-section-title">Ventana meteorológica — ${esc(today)}</p>
        ${summaryHtml}
        <div class="dash-card" style="margin-bottom:0.75rem">
            <div class="dash-card-label">Mejores horas hoy</div>
            <div style="font-size:0.85rem;color:#22c55e;margin-top:0.3rem">${bestWindowsText}</div>
        </div>
        <div class="dash-card">
            <div class="dash-card-label" style="margin-bottom:0.5rem">Timeline 24h — color = condición (verde=excelente, rojo=mala)</div>
            <div style="display:flex;gap:2px;overflow-x:auto;padding-bottom:4px">${timelineHtml}</div>
            <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:rgba(255,255,255,0.25);margin-top:4px">
                <span>Olas (m) debajo de la barra</span><span>Viento (km/h) bajo las olas</span>
            </div>
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
            ${(data.en_roz||0) > 0 ? `<div class="dash-card" style="border-color:#ef4444;background:rgba(239,68,68,0.06)"><div class="dash-card-label" style="color:#ef4444">EN ZONA ROZ</div><div class="dash-card-value" style="color:#ef4444">${data.en_roz}</div></div>` : ''}
            ${(data.interceptacion||0) > 0 ? `<div class="dash-card" style="border-color:#ef4444;background:rgba(239,68,68,0.12);animation:pulse 1s infinite"><div class="dash-card-label" style="color:#ef4444">INTERCEPTACIÓN</div><div class="dash-card-value" style="color:#ef4444">${data.interceptacion}</div><div class="dash-card-sub" style="color:#ef4444;font-size:0.6rem">ROJO RUMBO ROZ</div></div>` : ''}
        </div>`;

    // Interception warning banner
    const interceptBanner = (data.interceptacion||0) > 0
        ? `<div style="background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:8px;padding:0.6rem 1rem;margin-bottom:0.75rem;color:#ef4444;font-size:0.78rem;font-weight:600">
            ALERTA: ${data.interceptacion} buque(s) ROJO con rumbo hacia la Base Naval de Rota (ETA &lt; 2h)
           </div>`
        : '';

    const rozInfo = data.roz ? `<div class="alert-card" style="border-color:#ef4444;background:rgba(239,68,68,0.05);margin-bottom:0.75rem">
        <div class="alert-title">🚫 Zona ROZ — Base Naval Rota</div>
        <div class="alert-desc">Radio ${data.roz.radius_nm}nm desde ${data.roz.lat}°N ${Math.abs(data.roz.lon)}°W. Activa en mapa (toggle "Zona ROZ").</div>
    </div>` : '';

    let vigVessels = vessels;
    const filterControls = vessels.length ? `
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem">
            <select id="vig-filter-threat" onchange="filterVigTable()" style="background:#0d1520;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.7);padding:4px 8px;font-size:0.73rem">
                <option value="">Todas las amenazas</option>
                <option value="ROJO">Solo ROJO</option>
                <option value="AMARILLO">Solo AMARILLO</option>
                <option value="VERDE">Solo VERDE</option>
            </select>
            <select id="vig-filter-status" onchange="filterVigTable()" style="background:#0d1520;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.7);padding:4px 8px;font-size:0.73rem">
                <option value="">Todos los estados</option>
                <option value="EN MOVIMIENTO">En movimiento</option>
                <option value="FONDEADO">Fondeados</option>
            </select>
        </div>` : '';

    let vesselRows = '';
    if (!vessels.length) {
        vesselRows = '<p style="color:rgba(255,255,255,0.35);font-size:0.85rem;padding:0.5rem 0">Sin buques en el área de vigilancia.</p>';
    } else {
        const rozBadge = '<span style="background:#ef4444;color:white;font-size:0.55rem;padding:1px 5px;border-radius:6px;font-weight:700;margin-left:4px">ROZ</span>';
        const rowsHtml = vessels.map(v => {
            const safeMmsi = String(v.mmsi||'').replace(/[^0-9]/g,'');
            const aprobarBtn = v.amenaza === 'AMARILLO'
                ? `<button onclick="aprobarBuque('${esc(safeMmsi)}','${esc(v.name||'')}')" style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:4px;color:#22c55e;font-size:0.6rem;padding:1px 5px;cursor:pointer;margin-top:2px">Aprobar</button>`
                : '';
            return `<tr data-threat="${esc(v.amenaza)}" data-status="${esc(v.estado)}">
                <td><div>${esc(v.name)}${v.in_roz ? rozBadge : ''}</div>${aprobarBtn}</td>
                <td>${esc(v.type_name||v.type||'-')}</td>
                <td>${threatBadge(v.amenaza)}</td>
                <td>${statusBadge(v.estado)}</td>
                <td>${v.speed != null ? esc(v.speed.toFixed(1)) + ' kt' : '-'}</td>
                <td><a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${safeMmsi}" target="_blank" style="color:#4AC8E8;font-size:0.7rem">${esc(String(v.mmsi||''))}</a></td>
            </tr>`;
        }).join('');
        vesselRows = `${filterControls}<div style="overflow-x:auto"><table class="ais-table" id="vig-table">
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Amenaza</th><th>Estado</th><th>SOG</th><th>MMSI</th></tr></thead>
            <tbody id="vig-tbody">${rowsHtml}</tbody></table></div>`;
        requestAnimationFrame(() => makeSortable('vig-table'));
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
        ${interceptBanner}${rozInfo}${summary}
        <p class="dash-section-title">Seguimiento multi-buque</p>
        ${vesselRows}${oorSection}

        <p class="dash-section-title" style="margin-top:1rem">Log de incidencias</p>
        <div id="vig-log-panel"></div>

        <p class="dash-section-title" style="margin-top:1rem">Buques aprobados (whitelist)</p>
        <div id="buques-aprobados-panel"></div>`;

    // Load vigilancia log and approved vessels
    requestAnimationFrame(() => {
        renderVigilanciaLog('vig-log-panel');
        renderBuquesAprobados('buques-aprobados-panel');
    });
}

function renderVigilanciaLog(el_id) {
    const container = document.getElementById(el_id);
    if (!container) return;
    fetch('/api/vigilancia_log?limit=20')
        .then(r => r.json())
        .then(data => {
            const log = data.log || [];
            if (!log.length) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:0.78rem;padding:0.4rem 0">Sin incidencias registradas. El log se activa cuando se detectan buques ROJO/AMARILLO.</div>';
                return;
            }
            const threatColors = {ROJO:'#ef4444', AMARILLO:'#f59e0b', VERDE:'#22c55e'};
            const rows = log.map(e => {
                const tc = threatColors[e.amenaza] || '#888';
                return `<div style="display:flex;align-items:center;gap:0.6rem;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.72rem">
                    <span style="color:rgba(255,255,255,0.3);min-width:45px">${esc((e.ts||'').slice(11,16))}</span>
                    <span style="background:${tc};color:white;font-size:0.58rem;padding:1px 5px;border-radius:8px;min-width:48px;text-align:center">${esc(e.amenaza||'?')}</span>
                    <span style="color:rgba(255,255,255,0.7)">${esc(e.nombre||'?')}</span>
                    <span style="color:rgba(255,255,255,0.3);font-size:0.65rem">${esc(e.evento||'')} ${e.velocidad ? '· ' + parseFloat(e.velocidad).toFixed(1) + ' kt' : ''}</span>
                </div>`;
            }).join('');
            const csvBtnVigilancia = `<button onclick="exportVigilanciaCSV()" style="margin-top:0.5rem;background:rgba(74,200,232,0.08);border:1px solid rgba(74,200,232,0.2);border-radius:6px;color:#4AC8E8;font-size:0.68rem;padding:3px 10px;cursor:pointer">Exportar CSV</button>`;
            container.innerHTML = `<div>${rows}</div>${csvBtnVigilancia}`;
            container._logData = log;
        })
        .catch(() => {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:0.78rem">Error cargando log.</div>';
        });
}

function exportVigilanciaCSV() {
    const container = document.getElementById('vig-log-panel');
    const log = container?._logData || [];
    if (!log.length) { alert('Sin datos para exportar'); return; }
    const header = 'Hora,MMSI,Nombre,Amenaza,Evento,Velocidad,Lat,Lon,Timestamp\n';
    const rows = log.map(e =>
        [e.ts?.slice(11,16), e.mmsi, e.nombre, e.amenaza, e.evento,
         e.velocidad?.toFixed(1)||'', e.lat?.toFixed(4)||'', e.lon?.toFixed(4)||'', e.ts].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vigilancia_log_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function aprobarBuque(mmsi, nombre) {
    const motivo = prompt(`Aprobar buque ${nombre} (MMSI: ${mmsi}) — motivo (opcional):`);
    if (motivo === null) return; // cancelled
    fetch('/api/buques_aprobados', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({mmsi, nombre, motivo})
    }).then(r => r.json()).then(d => {
        if (d.ok) {
            if (typeof showToast === 'function') showToast(`Buque ${nombre} aprobado como VERDE.`, 'info', 5000);
            switchDashTab('vigilancia');
        }
    }).catch(() => {});
}

function filterVigTable() {
    const threat = document.getElementById('vig-filter-threat')?.value || '';
    const status = document.getElementById('vig-filter-status')?.value || '';
    const tbody = document.getElementById('vig-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(row => {
        const rowThreat = row.dataset.threat || '';
        const rowStatus = row.dataset.status || '';
        const show = (!threat || rowThreat === threat) && (!status || rowStatus === status);
        row.style.display = show ? '' : 'none';
    });
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
    const speciesWithCebo = data.species_with_cebo || species.map(s => ({especie: s}));
    const speciesCards = speciesWithCebo.map(sc => {
        const tempOkColor = sc.temp_ok === true ? '#22c55e' : sc.temp_ok === false ? '#f59e0b' : '';
        const tempBadge = sc.temp_nota
            ? `<div style="font-size:0.6rem;color:${tempOkColor||'rgba(255,255,255,0.3)'};margin-top:0.2rem">${sc.temp_ok === true ? '🌡✓' : sc.temp_ok === false ? '🌡✗' : '🌡'} ${esc(sc.temp_nota)}</div>`
            : '';
        return `<div class="dash-card" style="padding:0.6rem">
            <div style="display:flex;align-items:center;gap:0.4rem">
                <span style="font-size:1.1rem">${speciesIcons[sc.especie]||'🐟'}</span>
                <div>
                    <div style="font-size:0.75rem;color:rgba(255,255,255,0.85);font-weight:600">${esc(sc.especie)}</div>
                    <div style="font-size:0.58rem;color:#22c55e">EN TEMPORADA</div>
                </div>
            </div>
            ${tempBadge}
            ${sc.cebo ? `<div style="font-size:0.65rem;color:rgba(255,255,255,0.5);margin-top:0.35rem">
                <div>🪱 ${esc(sc.cebo)}</div>
                <div style="margin-top:0.15rem">🎣 ${esc(sc.tecnica||'')}</div>
            </div>` : ''}
         </div>`;
    }).join('');

    const hoursDetail = data.best_hours_detail || hours.map(h => ({hora: h, nota: ''}));
    const hoursHtml = hoursDetail.slice(0, 8).map(hd =>
        `<div style="display:flex;align-items:center;gap:0.4rem;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span style="background:rgba(74,200,232,0.12);border:1px solid rgba(74,200,232,0.25);border-radius:6px;padding:2px 10px;font-size:0.78rem;color:#4AC8E8;min-width:44px;text-align:center">${esc(hd.hora||hd)}</span>
            ${hd.nota ? `<span style="font-size:0.65rem;color:rgba(255,255,255,0.35)">${esc(hd.nota)}</span>` : ''}
        </div>`
    ).join('');

    const reasonsOk = (data.reasons_ok||[]).map(r => `<div style="color:#22c55e;font-size:0.75rem">✓ ${esc(r)}</div>`).join('');
    const reasonsBad = (data.reasons_bad||[]).map(r => `<div style="color:#ef4444;font-size:0.75rem">✗ ${esc(r)}</div>`).join('');
    const profColor = esc(data.profundidad_color || '#4AC8E8');
    const profHtml = data.profundidad_consejo
        ? `<div class="dash-card" style="margin-bottom:0.75rem;border-left:3px solid ${profColor}">
            <div class="dash-card-label">Recomendación de profundidad</div>
            <div style="font-size:0.78rem;color:${profColor};margin-top:0.35rem">${esc(data.profundidad_consejo)}</div>
           </div>`
        : '';

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

        ${profHtml}

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
        <div class="dash-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${speciesCards}</div>

        <p class="dash-section-title" style="margin-top:1rem">Calendario de temporadas</p>
        <div id="calendario-pesca" style="overflow-x:auto">${buildCalendarioPesca(species, data.species_off_season||[])}</div>

        <p class="dash-section-title" style="margin-top:1rem">Diario de capturas</p>
        <div id="capturas-panel"></div>`;

    if (sparkData.length) {
        requestAnimationFrame(() => {
            const labels = sparkData.map((_,i) => `T${i}`);
            drawLineChart('#chart-temp-agua', labels, sparkData, '°C', '#4AC8E8');
        });
    }
    // Load captures panel
    requestAnimationFrame(() => renderCapturasPanel('capturas-panel'));
}

// =================== HISTORIAL DE CONDICIONES ===================
function renderHistorial(data, el) {
    const dias = data.dias || [];

    if (!dias.length) {
        el.innerHTML = `<p class="dash-section-title">Historial de condiciones</p>
            <div class="dash-card">
                <div class="dash-card-label">Sin datos históricos</div>
                <div style="font-size:0.78rem;color:rgba(255,255,255,0.3);margin-top:0.4rem">
                    El historial se registra automáticamente una vez al día. Vuelve mañana para ver el primer dato.
                </div>
            </div>`;
        return;
    }

    const fechas = dias.map(d => d.fecha?.slice(5) || '');  // MM-DD
    const olas = dias.map(d => d.ola_max);
    const vientos = dias.map(d => d.viento_kmh);
    const temps_agua = dias.map(d => d.temp_agua);
    const presiones = dias.map(d => d.presion);

    // Summary table
    const tableRows = dias.slice().reverse().map(d => {
        const score = d.ola_max > 2 || d.viento_kmh > 25 ? 'Malo' : d.ola_max > 1 ? 'Regular' : 'Bueno';
        const scoreColor = score === 'Bueno' ? '#22c55e' : score === 'Regular' ? '#f59e0b' : '#ef4444';
        return `<tr style="font-size:0.72rem">
            <td style="color:rgba(255,255,255,0.6);padding:4px 6px">${esc(d.fecha||'')}</td>
            <td style="text-align:center">${d.ola_max != null ? d.ola_max.toFixed(1) + 'm' : '-'}</td>
            <td style="text-align:center">${d.viento_kmh != null ? d.viento_kmh.toFixed(0) + 'km/h' : '-'}</td>
            <td style="text-align:center">${d.temp_agua != null ? d.temp_agua.toFixed(1) + '°C' : '-'}</td>
            <td style="text-align:center">${d.presion != null ? d.presion.toFixed(0) + ' hPa' : '-'}</td>
            <td style="color:${scoreColor};text-align:center;font-weight:600">${score}</td>
        </tr>`;
    }).join('');

    el.innerHTML = `
        <p class="dash-section-title">Historial de condiciones — últimos ${dias.length} días</p>
        <div class="dash-chart-container" id="chart-hist-olas" style="height:100px"></div>
        <div class="dash-chart-container" id="chart-hist-viento" style="height:90px"></div>
        ${temps_agua.some(t=>t!=null) ? '<div class="dash-chart-container" id="chart-hist-temp-agua" style="height:90px"></div>' : ''}
        <div style="overflow-x:auto;margin-top:0.75rem">
            <table style="width:100%;border-collapse:collapse">
                <thead><tr style="font-size:0.65rem;color:rgba(255,255,255,0.4)">
                    <th style="text-align:left;padding:4px 6px">Fecha</th>
                    <th>Ola máx</th><th>Viento</th><th>T. agua</th><th>Presión</th><th>Cond.</th>
                </tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>`;

    requestAnimationFrame(() => {
        drawLineChart('#chart-hist-olas', fechas, olas, 'm', '#4AC8E8');
        drawLineChart('#chart-hist-viento', fechas, vientos, 'km/h', '#f59e0b');
        observeChart('#chart-hist-olas');
        observeChart('#chart-hist-viento');
        if (temps_agua.some(t=>t!=null)) {
            drawLineChart('#chart-hist-temp-agua', fechas, temps_agua, '°C', '#ef4444');
            observeChart('#chart-hist-temp-agua');
        }
    });
}

// =================== BUQUES APROBADOS (panel in vigilancia) ===================
function renderBuquesAprobados(el_id) {
    const container = document.getElementById(el_id);
    if (!container) return;
    fetch('/api/buques_aprobados')
        .then(r => r.json())
        .then(data => {
            const buques = data.buques || [];
            if (!buques.length) {
                container.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:0.78rem">Sin buques aprobados. Usa el botón "Aprobar" en la tabla para añadir buques de confianza.</div>';
                return;
            }
            const rows = buques.map(b => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.72rem">
                    <div>
                        <span style="color:rgba(255,255,255,0.8)">${esc(b.nombre||b.mmsi)}</span>
                        <span style="color:rgba(255,255,255,0.35);margin-left:8px">${esc(b.mmsi)}</span>
                        ${b.motivo ? `<div style="color:rgba(255,255,255,0.3);font-size:0.62rem">${esc(b.motivo)}</div>` : ''}
                    </div>
                    <button onclick="revocarBuqueAprobado('${esc(b.mmsi)}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:5px;color:#ef4444;font-size:0.65rem;padding:2px 7px;cursor:pointer">Revocar</button>
                </div>`).join('');
            container.innerHTML = rows;
        })
        .catch(() => {
            container.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:0.78rem">Error cargando lista.</div>';
        });
}

function revocarBuqueAprobado(mmsi) {
    if (!confirm(`¿Revocar aprobación del MMSI ${mmsi}?`)) return;
    fetch(`/api/buques_aprobados/${encodeURIComponent(mmsi)}`, {method: 'DELETE'})
        .then(() => renderBuquesAprobados('buques-aprobados-panel'))
        .catch(() => {});
}

// =================== PESCA CALENDARIO DE TEMPORADAS ===================
const SPECIES_CALENDAR_JS = {
    'Dorada':      [1,2,3,10,11,12],
    'Lubina':      [1,2,3,4,9,10,11,12],
    'Atún':        [5,6,7,8,9],
    'Pargo':       [4,5,6,7,8,9,10],
    'Boquerón':    [3,4,5,6,7,8],
    'Caballa':     [3,4,5,6,7,8,9],
    'Lenguado':    [2,3,4,5,10,11],
    'Choco':       [1,2,3,10,11,12],
    'Gamba':       [1,2,3,4,10,11,12],
    'Langostino':  [4,5,6,7,8,9],
    'Pez espada':  [6,7,8,9],
    'Dentón':      [4,5,6,7,8,9,10],
};
const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function buildCalendarioPesca(inSeason, offSeason) {
    const allSpecies = [...inSeason, ...offSeason];
    const currentMonth = new Date().getMonth() + 1; // 1-12

    const headerCells = MONTH_LABELS.map((m, i) => {
        const isCurrentMonth = (i + 1) === currentMonth;
        const style = isCurrentMonth
            ? 'background:rgba(74,200,232,0.15);color:#4AC8E8;font-weight:700;'
            : 'color:rgba(255,255,255,0.4);';
        return `<th style="font-size:0.62rem;padding:3px 5px;text-align:center;${style}">${esc(m)}</th>`;
    }).join('');

    const rows = allSpecies.map(sp => {
        const months = SPECIES_CALENDAR_JS[sp] || [];
        const isInSeason = inSeason.includes(sp);
        const cells = MONTH_LABELS.map((m, i) => {
            const mon = i + 1;
            const active = months.includes(mon);
            const isCurrentMonth = mon === currentMonth;
            let bg = 'rgba(255,255,255,0.04)';
            let color = 'transparent';
            if (active) {
                bg = isCurrentMonth ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.18)';
                color = isCurrentMonth ? '#22c55e' : 'rgba(34,197,94,0.6)';
            }
            return `<td style="background:${bg};border-radius:3px;padding:3px 2px;text-align:center">
                ${active ? `<span style="color:${color};font-size:0.65rem">●</span>` : '<span style="color:transparent;font-size:0.65rem">·</span>'}
            </td>`;
        }).join('');
        const spColor = isInSeason ? '#22c55e' : 'rgba(255,255,255,0.35)';
        return `<tr>
            <td style="font-size:0.7rem;color:${spColor};padding:3px 8px;white-space:nowrap;min-width:90px">${esc(sp)}</td>
            ${cells}
        </tr>`;
    }).join('');

    return `<table style="border-collapse:separate;border-spacing:2px;width:100%;font-size:0.65rem">
        <thead><tr>
            <th style="font-size:0.62rem;padding:3px 8px;text-align:left;color:rgba(255,255,255,0.3)">Especie</th>
            ${headerCells}
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div style="font-size:0.6rem;color:rgba(255,255,255,0.2);margin-top:4px">Verde = en temporada · Mes actual resaltado en azul</div>`;
}

// =================== SORTABLE TABLE HELPER ===================
function makeSortable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, colIndex) => {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        let sortAsc = true;
        th.addEventListener('click', () => {
            const tbody = table.querySelector('tbody');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            rows.sort((a, b) => {
                const aText = (a.cells[colIndex]?.textContent || '').trim();
                const bText = (b.cells[colIndex]?.textContent || '').trim();
                const aNum = parseFloat(aText);
                const bNum = parseFloat(bText);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return sortAsc ? aNum - bNum : bNum - aNum;
                }
                return sortAsc ? aText.localeCompare(bText) : bText.localeCompare(aText);
            });
            sortAsc = !sortAsc;
            rows.forEach(r => tbody.appendChild(r));
            // Update sort indicator
            headers.forEach(h => h.textContent = h.textContent.replace(' ↑',' ').replace(' ↓',' '));
            th.textContent += sortAsc ? ' ↓' : ' ↑';
        });
    });
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

// =================== MAÑANA — VENTANA METEOROLÓGICA ===================
function renderManana(data, el) {
    // Re-use renderHoy logic but with different title
    const hours = data.hours || [];
    const tomorrow = data.date || '';
    const nowH = -1; // no current-hour highlight for tomorrow

    if (!hours.length) {
        el.innerHTML = `<p class="dash-section-title">Ventana meteorológica mañana — ${esc(tomorrow)}</p>
            <p style="color:rgba(255,255,255,0.35);padding:0.5rem">No hay datos disponibles para mañana.</p>`;
        return;
    }

    const best = hours.filter(h => h.score >= 8);
    const good = hours.filter(h => h.score >= 5 && h.score < 8);
    const bad = hours.filter(h => h.score < 5);

    const summaryHtml = `
        <div class="dash-grid" style="margin-bottom:0.75rem">
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label" style="color:#22c55e">Horas excelentes</div>
                <div class="dash-card-value" style="color:#22c55e">${best.length}</div>
            </div>
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label" style="color:#f59e0b">Horas aceptables</div>
                <div class="dash-card-value" style="color:#f59e0b">${good.length}</div>
            </div>
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label" style="color:#ef4444">Horas malas</div>
                <div class="dash-card-value" style="color:#ef4444">${bad.length}</div>
            </div>
        </div>`;

    const timelineHtml = hours.map(h => `
        <div style="flex:1;min-width:38px;text-align:center;border-radius:6px;padding:4px 2px;background:rgba(255,255,255,0.03)">
            <div style="font-size:0.6rem;color:rgba(255,255,255,0.4)">${esc(h.time)}</div>
            <div style="width:100%;height:24px;background:${esc(h.color)};opacity:${0.3+h.score/14};border-radius:3px;margin:2px 0"></div>
            <div style="font-size:0.58rem;color:rgba(255,255,255,0.4)">${h.wave_h}m</div>
            <div style="font-size:0.58rem;color:rgba(255,255,255,0.35)">${h.wind}km</div>
        </div>`).join('');

    const bestWindowsText = best.length
        ? best.map(h => esc(h.time)).slice(0, 6).join(', ')
        : 'Ninguna ventana ideal mañana';

    el.innerHTML = `
        <p class="dash-section-title">Ventana meteorológica mañana — ${esc(tomorrow)}</p>
        ${summaryHtml}
        <div class="dash-card" style="margin-bottom:0.75rem">
            <div class="dash-card-label">Mejores horas mañana</div>
            <div style="font-size:0.85rem;color:#22c55e;margin-top:0.3rem">${bestWindowsText}</div>
        </div>
        <div class="dash-card">
            <div class="dash-card-label" style="margin-bottom:0.5rem">Timeline 24h — color = condición (verde=excelente, rojo=mala)</div>
            <div style="display:flex;gap:2px;overflow-x:auto;padding-bottom:4px">${timelineHtml}</div>
            <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:rgba(255,255,255,0.25);margin-top:4px">
                <span>Olas (m) debajo de la barra</span><span>Viento (km/h) bajo las olas</span>
            </div>
        </div>`;
}

// =================== CORRIENTES OCEÁNICAS ===================
function renderCorrientes(data, el) {
    if (data.error) {
        el.innerHTML = `<p class="dash-section-title">Corrientes oceánicas</p>
            <p style="color:rgba(255,255,255,0.35);padding:0.5rem">No hay datos de corrientes disponibles: ${esc(data.error)}</p>`;
        return;
    }
    const vel = data.current_vel;
    const dir = data.current_dir;
    const samples = data.samples || [];

    const velColor = vel == null ? 'rgba(255,255,255,0.3)' :
                     vel < 0.5 ? '#22c55e' : vel < 1.0 ? '#f59e0b' : '#ef4444';
    const velLabel = vel == null ? 'Sin datos' :
                     vel < 0.5 ? 'Suave' : vel < 1.0 ? 'Moderada' : 'Fuerte';

    let dirName = '-';
    if (dir != null) {
        const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
        dirName = dirs[Math.round(dir / 22.5) % 16];
    }

    // Sample timeline
    const samplesHtml = samples.map(s => {
        const sv = s.vel;
        const sc = sv < 0.5 ? '#22c55e' : sv < 1.0 ? '#f59e0b' : '#ef4444';
        return `<div style="flex:1;min-width:44px;text-align:center;background:rgba(255,255,255,0.03);border-radius:6px;padding:4px 2px">
            <div style="font-size:0.6rem;color:rgba(255,255,255,0.4)">${String(s.hour).padStart(2,'0')}:00</div>
            <div style="font-size:0.8rem;font-weight:600;color:${sc}">${sv.toFixed(2)}</div>
            <div style="font-size:0.58rem;color:rgba(255,255,255,0.35)">m/s</div>
            <div style="font-size:0.58rem;color:rgba(255,255,255,0.25)">${s.dir.toFixed(0)}°</div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <p class="dash-section-title">Corrientes oceánicas — Bahía de Cádiz</p>
        <div class="dash-grid" style="margin-bottom:0.75rem">
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label">Velocidad actual</div>
                <div class="dash-card-value" style="color:${velColor}">${vel != null ? vel.toFixed(2) + ' m/s' : '-'}</div>
                <div class="dash-card-sub" style="color:${velColor}">${velLabel}</div>
            </div>
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label">Dirección</div>
                <div class="dash-card-value">${dir != null ? dir.toFixed(0) + '°' : '-'}</div>
                <div class="dash-card-sub">${dirName}</div>
            </div>
            <div class="dash-card" style="text-align:center">
                <div class="dash-card-label">Estado</div>
                <div class="dash-card-value" style="color:${velColor};font-size:1rem">${velLabel}</div>
                <div class="dash-card-sub" style="font-size:0.6rem;color:rgba(255,255,255,0.25)">Open-Meteo Marine</div>
            </div>
        </div>
        ${samples.length ? `<div class="dash-card">
            <div class="dash-card-label" style="margin-bottom:0.5rem">Velocidad de corriente — cada 3h</div>
            <div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px">${samplesHtml}</div>
        </div>` : ''}
        <div class="dash-card" style="margin-top:0.75rem;font-size:0.7rem;color:rgba(255,255,255,0.3)">
            Las corrientes superficiales afectan especialmente a embarcaciones ligeras y pesqueros.
            Corrientes &gt; 1 m/s (2 kt) pueden dificultar el fondeo y aumentar el consumo de combustible.
        </div>`;
}

// =================== PESCA — REGISTRO DE CAPTURAS ===================
// Shown as sub-section inside renderPesca
function renderCapturasPanel(el_id) {
    const container = document.getElementById(el_id);
    if (!container) return;

    fetch('/api/capturas')
        .then(r => r.json())
        .then(data => {
            const capturas = data.capturas || [];
            const stats = data.stats || {};
            const speciesOptions = [
                'Dorada','Lubina','Atún','Pargo','Boquerón','Caballa',
                'Lenguado','Choco','Gamba','Langostino','Pez espada','Dentón','Otra'
            ].map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');

            // Stats summary
            const statsHtml = Object.entries(stats).map(([sp, st]) =>
                `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:0.75rem">
                    <span style="color:rgba(255,255,255,0.7)">${esc(sp)}</span>
                    <span style="color:#4AC8E8">${st.count} capturas · ${st.total_kg.toFixed(1)} kg · máx ${st.max_kg.toFixed(1)} kg</span>
                </div>`
            ).join('') || '<div style="color:rgba(255,255,255,0.3);font-size:0.78rem">Sin capturas registradas aún.</div>';

            // Recent catches list
            const recentHtml = capturas.slice(0,5).map(cap => {
                const cond = cap.condiciones || {};
                const condStr = cond.olas_m != null ? `Olas: ${cond.olas_m}m · Viento: ${cond.viento_kmh} km/h` : '';
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
                    <div>
                        <div style="font-size:0.78rem;color:rgba(255,255,255,0.85)">${esc(cap.especie)} ${cap.peso_kg ? `· ${cap.peso_kg} kg` : ''} ${cap.longitud_cm ? `· ${cap.longitud_cm} cm` : ''}</div>
                        <div style="font-size:0.62rem;color:rgba(255,255,255,0.3)">${esc(cap.fecha)} ${condStr ? '· ' + esc(condStr) : ''}</div>
                        ${cap.notas ? `<div style="font-size:0.62rem;color:rgba(255,255,255,0.4)">${esc(cap.notas)}</div>` : ''}
                    </div>
                    <button onclick="eliminarCaptura(${cap.id})" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:5px;color:#ef4444;font-size:0.65rem;padding:2px 6px;cursor:pointer">Borrar</button>
                </div>`;
            }).join('') || '<div style="color:rgba(255,255,255,0.3);font-size:0.78rem">Sin capturas recientes.</div>';

            container.innerHTML = `
                <div class="dash-card" style="margin-bottom:0.75rem">
                    <div class="dash-card-label" style="margin-bottom:0.5rem">Registrar captura</div>
                    <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:flex-end">
                        <select id="cap-especie" style="background:#0d1520;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.8);padding:4px 8px;font-size:0.75rem">${speciesOptions}</select>
                        <input id="cap-peso" placeholder="Peso (kg)" type="number" step="0.1" min="0" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:white;padding:4px 8px;font-size:0.75rem;width:90px">
                        <input id="cap-long" placeholder="Long. (cm)" type="number" step="1" min="0" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:white;padding:4px 8px;font-size:0.75rem;width:90px">
                        <input id="cap-notas" placeholder="Notas" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:white;padding:4px 8px;font-size:0.75rem;width:130px">
                        <button onclick="guardarCaptura()" style="background:#4AC8E8;border:none;border-radius:6px;color:white;font-size:0.75rem;padding:5px 12px;cursor:pointer;font-weight:600">+ Registrar</button>
                    </div>
                </div>
                ${Object.keys(stats).length ? `<div class="dash-card" style="margin-bottom:0.75rem">
                    <div class="dash-card-label" style="margin-bottom:0.4rem">Estadísticas personales</div>
                    ${statsHtml}
                </div>` : ''}
                ${capturas.length ? `<div class="dash-card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
                        <div class="dash-card-label">Últimas capturas</div>
                        <button onclick="exportCapturasCSV()" style="background:rgba(74,200,232,0.08);border:1px solid rgba(74,200,232,0.2);border-radius:6px;color:#4AC8E8;font-size:0.65rem;padding:2px 8px;cursor:pointer">Exportar CSV</button>
                    </div>
                    ${recentHtml}
                    ${capturas.length > 5 ? `<div style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-top:4px">Mostrando 5 de ${capturas.length} capturas</div>` : ''}
                </div>` : `<div class="dash-card"><div class="dash-card-label">Sin capturas registradas</div><div style="font-size:0.78rem;color:rgba(255,255,255,0.3);margin-top:0.4rem">Usa el formulario de arriba para registrar tu primera captura. Las condiciones meteorológicas del momento se guardarán automáticamente.</div></div>`}`;
        })
        .catch(() => {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:0.8rem">Error cargando capturas.</p>';
        });
}

function exportCapturasCSV() {
    fetch('/api/capturas')
        .then(r => r.json())
        .then(data => {
            const capturas = data.capturas || [];
            if (!capturas.length) { alert('Sin capturas para exportar'); return; }
            const header = 'ID,Especie,Peso_kg,Longitud_cm,Fecha,Notas,Olas_m,Viento_kmh,Presion_hPa,Temp_agua,Creado\n';
            const rows = capturas.map(c => {
                const cond = c.condiciones || {};
                return [c.id, c.especie, c.peso_kg||'', c.longitud_cm||'',
                        c.fecha||'', (c.notas||'').replace(/,/g,';'),
                        cond.olas_m||'', cond.viento_kmh||'', cond.presion_hpa||'',
                        cond.temp_agua||'', c.creado||''].join(',');
            }).join('\n');
            const blob = new Blob([header + rows], {type: 'text/csv'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `capturas_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        })
        .catch(() => alert('Error al exportar capturas'));
}

function guardarCaptura() {
    const especie = document.getElementById('cap-especie')?.value || 'Otra';
    const peso = parseFloat(document.getElementById('cap-peso')?.value) || null;
    const longitud = parseFloat(document.getElementById('cap-long')?.value) || null;
    const notas = document.getElementById('cap-notas')?.value || '';
    fetch('/api/capturas', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({especie, peso_kg: peso, longitud_cm: longitud, notas})
    }).then(r => r.json()).then(d => {
        if (d.ok) {
            renderCapturasPanel('capturas-panel');
            // Reset form
            if (document.getElementById('cap-peso')) document.getElementById('cap-peso').value = '';
            if (document.getElementById('cap-long')) document.getElementById('cap-long').value = '';
            if (document.getElementById('cap-notas')) document.getElementById('cap-notas').value = '';
        }
    }).catch(() => {});
}

function eliminarCaptura(id) {
    if (!confirm('¿Eliminar esta captura?')) return;
    fetch(`/api/capturas/${id}`, {method: 'DELETE'})
        .then(() => renderCapturasPanel('capturas-panel'))
        .catch(() => {});
}
