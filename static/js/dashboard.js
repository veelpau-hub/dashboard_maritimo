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
    document.getElementById('dash-tab-label').textContent = DASH_LABELS[tab] || 'DASHBOARD';
    document.querySelectorAll('.submenu-btn').forEach(b => b.classList.remove('active'));
    const idx = Object.keys(DASH_LABELS).indexOf(tab);
    if (idx >= 0) document.querySelectorAll('.submenu-btn')[idx].classList.add('active');

    const content = document.getElementById('dash-content');
    content.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:0.8rem;padding:1rem">Cargando...</p>';

    const coordAware = ['meteo','oleaje','prediccion'];
    let url = `/api/dashboard/${tab}`;
    if (window.geoCoords && coordAware.includes(tab))
        url += `?lat=${window.geoCoords.lat}&lon=${window.geoCoords.lon}`;

    fetch(url)
        .then(r => r.json())
        .then(data => { const fn = renders[tab]; if (fn) fn(data, content); })
        .catch(() => { content.innerHTML = '<p style="color:#ef4444;padding:1rem">Error cargando datos.</p>'; });
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
    el.innerHTML = `
        <p class="dash-section-title">Oleaje — 7 días</p>
        <div class="dash-grid">
            <div class="dash-card"><div class="dash-card-label">Altura actual</div>
                <div class="dash-card-value">${current?.toFixed(1)}m</div></div>
            <div class="dash-card"><div class="dash-card-label">Período</div>
                <div class="dash-card-value">${(data.period?.find(v=>v)??0).toFixed(0)}s</div></div>
            ${tempAgua!=null?`<div class="dash-card"><div class="dash-card-label">Temp. agua</div>
                <div class="dash-card-value">${tempAgua.toFixed(1)}°</div></div>`:''}
        </div>
        <div class="dash-chart-container" id="chart-olas" style="height:160px"></div>`;
    requestAnimationFrame(() => {
        drawLineChart('#chart-olas', horas, heights, 'm', '#4AC8E8');
        observeChart('#chart-olas');
    });
}

function renderMareas(data, el) {
    const rows = (data.extremes||[]).map(e => `
        <div class="dash-card" style="flex-direction:row;align-items:center;gap:1rem;display:flex">
            <span style="font-size:1.5rem">${e.type==='pleamar'?'↑':'↓'}</span>
            <div>
                <div class="dash-card-label">${e.type==='pleamar'?'Pleamar':'Bajamar'}</div>
                <div class="dash-card-value" style="font-size:1.1rem">${e.time}</div>
                <div class="dash-card-sub">${e.height?.toFixed(1)}m</div>
            </div>
        </div>`).join('');
    const note = data.source==='estimado'
        ? '<p style="color:rgba(255,255,255,0.25);font-size:0.7rem;margin-top:0.5rem">⚠ Datos estimados. Configura la API de Puertos del Estado para datos oficiales.</p>'
        : '';
    el.innerHTML = `<p class="dash-section-title">Mareas — hoy</p><div class="dash-grid">${rows}</div>${note}`;
}

function renderAIS(data, el) {
    if (data.note) { el.innerHTML=`<p style="color:rgba(255,255,255,0.35);padding:1rem">${esc(data.note)}</p>`; return; }
    const vessels = data.vessels||[];
    if (!vessels.length) { el.innerHTML='<p style="color:rgba(255,255,255,0.35);padding:1rem">Sin buques detectados en el área.</p>'; return; }
    const rows = vessels.map(v=>`<tr>
        <td>${esc(v.name)}</td><td>${esc(String(v.type||'-'))}</td>
        <td>${v.speed!=null?v.speed.toFixed(1)+' kt':'-'}</td>
        <td>${v.course!=null?v.course+'°':'-'}</td>
        <td><a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${esc(String(v.mmsi||''))}" target="_blank" style="color:#4AC8E8;font-size:0.7rem">${esc(String(v.mmsi||''))}</a></td>
        </tr>`).join('');
    el.innerHTML = `
        <p class="dash-section-title">Buques en el área de Rota (~5 min retraso)</p>
        <div class="ais-table-wrap"><table class="ais-table">
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Velocidad</th><th>Rumbo</th><th>MMSI</th></tr></thead>
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
    el.innerHTML=`
        <p class="dash-section-title">Calidad del aire — ahora</p>
        <div class="dash-grid">
            <div class="dash-card"><div class="dash-card-label">Índice AQI</div>
                <div class="dash-card-value" style="color:${color}">${aqi}</div>
                <div class="dash-card-sub">${label}</div></div>
            <div class="dash-card"><div class="dash-card-label">UV</div>
                <div class="dash-card-value">${data.uv?.toFixed(1)||'-'}</div></div>
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
    const goText = gn.go ? 'SÍ PUEDES SALIR' : 'NO SALGAS';
    const moon = data.moon || {};
    const hours = (data.best_hours || []).slice(0, 6);
    const species = data.species_in_season || [];
    const tempAgua = data.temp_agua_current;

    const speciesCards = species.map(s =>
        `<div class="dash-card" style="text-align:center;padding:0.6rem">
            <div style="font-size:1.2rem">🐟</div>
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
