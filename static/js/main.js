let esCelsius = true;
let prefsActuales = { ...prefsIniciales };

const WIDGET_NOMBRES = {
    temperatura: 'Temperatura',
    viento: 'Viento',
    sol: 'Salida/Puesta sol',
    olas: 'Altura olas',
    presion: 'Presión',
    visibilidad: 'Visibilidad',
    beaufort: 'Escala Beaufort',
    temperatura_agua: 'Temp. agua',
    mareas: 'Mareas',
    prediccion: 'Predicción 3 días'
};

// --- HAMBURGER / SIDEBAR MOBILE ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('visible', isOpen);
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
}

function switchTab(tab) {
    closeSidebar();
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('submenu').classList.remove('visible');
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));

    const idx = { overview: 0, dashboard: 1, mapa: 2, settings: 3 };
    const ids = ['panel-overview', 'panel-dashboard', 'panel-mapa', 'panel-settings'];

    if (tab in idx) {
        document.getElementById(ids[idx[tab]]).classList.remove('hidden');
        document.querySelectorAll('.sidebar-btn')[idx[tab]].classList.add('active');
    }
    if (tab === 'dashboard') {
        document.getElementById('submenu').classList.add('visible');
        const banner = document.getElementById('ad-banner-dash');
        if (banner) banner.style.display = 'flex';
        // Mobile: mark panel as having submenu for extra padding
        document.getElementById('panel-dashboard').classList.add('has-submenu');
    }
    if (tab === 'mapa') {
        if (window.mapa) window.mapa.resize();
        if (typeof initMapLayers === 'function') initMapLayers();
    }
    if (tab === 'settings') {
        if (typeof renderSettingsWidgets === 'function') renderSettingsWidgets();
    }
}

function toggleTemp() {
    esCelsius = !esCelsius;
    const btn = document.getElementById('temp-btn');
    const valor = document.getElementById('temp-valor');
    const sensacion = document.getElementById('sensacion');
    if (esCelsius) {
        valor.textContent = tempC + '°';
        sensacion.textContent = sensacionC + '°C';
        btn.textContent = '°C';
    } else {
        valor.textContent = Math.round(tempC * 9/5 + 32) + '°';
        sensacion.textContent = Math.round(sensacionC * 9/5 + 32) + '°F';
        btn.textContent = '°F';
    }
}

function aplicarPrefs() {
    document.querySelectorAll('.widget').forEach(el => {
        const w = el.dataset.widget;
        el.style.display = prefsActuales[w] === false ? 'none' : '';
    });
}

function toggleConfig() {
    const panel = document.getElementById('config-panel');
    panel.classList.toggle('hidden');
    renderConfigGrid();
}

function renderConfigGrid() {
    const grid = document.getElementById('config-grid');
    grid.innerHTML = '';
    Object.entries(WIDGET_NOMBRES).forEach(([key, nombre]) => {
        const activo = prefsActuales[key] !== false;
        grid.innerHTML += `
            <div class="config-item">
                <span>${nombre}</span>
                <button class="toggle-btn ${activo ? 'on' : 'off'}"
                    onclick="toggleWidget('${key}')">
                    ${activo ? 'ON' : 'OFF'}
                </button>
            </div>`;
    });
}

function toggleWidget(key) {
    prefsActuales[key] = !prefsActuales[key];
    aplicarPrefs();
    renderConfigGrid();
}

async function guardarPrefs() {
    await fetch('/api/preferencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefsActuales)
    });
    toggleConfig();
}

aplicarPrefs();

// --- PRESION TREND ---
function updatePresionTrend() {
    fetch('/api/presion_trend')
        .then(r => r.json())
        .then(d => {
            const badge = document.getElementById('presion-trend-badge');
            if (!badge) return;
            const icons = {subiendo:'↑', bajando:'↓', estable:'→'};
            const colors = {subiendo:'#22c55e', bajando:'#ef4444', estable:'rgba(255,255,255,0.4)'};
            const icon = icons[d.trend] || '→';
            const color = colors[d.trend] || '#aaa';
            badge.style.display = 'block';
            badge.style.fontSize = '0.7rem';
            badge.style.color = color;
            badge.textContent = `${icon} ${d.trend}`;
            if (d.delta_h) badge.textContent += ` (${d.delta_h > 0 ? '+' : ''}${d.delta_h} hPa/h)`;
            // Storm banner
            if (d.alert) {
                let banner = document.getElementById('storm-alert-banner');
                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = 'storm-alert-banner';
                    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ef4444;color:white;text-align:center;font-size:0.8rem;font-weight:700;padding:6px;z-index:999;cursor:pointer';
                    banner.onclick = () => banner.remove();
                    document.body.prepend(banner);
                }
                const alertMsg = d.current < 1000
                    ? `ALERTA: Presion muy baja ${d.current} hPa - Posible temporal. Haz clic para cerrar.`
                    : `ALERTA: Presion cayendo rapido (${d.delta_h} hPa/h) - Deterioro inminente.`;
                banner.textContent = alertMsg;
            }
        })
        .catch(() => {});
}
updatePresionTrend();
setInterval(updatePresionTrend, 300000);

// --- AUTO-REFRESH OVERVIEW (every 5 min) ---
function autoRefreshOverview() {
    fetch('/api/datos')
        .then(r => r.json())
        .then(d => {
            if (!d || d.error) return;
            // Update temperature
            if (tempUnit === 'f') {
                document.getElementById('temp-valor').textContent = Math.round(d.temperatura_c * 9/5 + 32) + '°';
                document.getElementById('sensacion').textContent = Math.round(d.sensacion_c * 9/5 + 32) + '°F';
            } else {
                document.getElementById('temp-valor').textContent = d.temperatura_c + '°';
                document.getElementById('sensacion').textContent = d.sensacion_c + '°C';
            }
            // Show last updated badge
            let badge = document.getElementById('auto-refresh-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'auto-refresh-badge';
                badge.style.cssText = 'font-size:0.6rem;color:rgba(255,255,255,0.2);position:absolute;bottom:6px;right:10px';
                const overview = document.getElementById('panel-overview');
                if (overview) { overview.style.position = 'relative'; overview.appendChild(badge); }
            }
            badge.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-ES', {hour:'2-digit',minute:'2-digit'});
        })
        .catch(() => {});
}
setInterval(autoRefreshOverview, 300000);

// --- PESCA QUICK BADGE ---
function loadPescaBadge() {
    fetch('/api/pesca_quick')
        .then(r => r.json())
        .then(d => {
            const badge = document.getElementById('pesca-badge');
            if (!badge) return;
            const idx = d.fishing_index || 5;
            const color = idx <= 3 ? '#ef4444' : idx <= 6 ? '#f59e0b' : '#22c55e';
            const goText = d.go ? 'Salir' : 'Esperar';
            badge.innerHTML = `🎣 <span style="color:${color};font-weight:700">${idx}/10</span> · ${goText}`;
            badge.title = `Índice de pesca: ${idx}/10. Ola: ${d.wave_h}m, Viento: ${d.wind_kmh}km/h. Clic para ver detalle.`;
        })
        .catch(() => {});
}
loadPescaBadge();
setInterval(loadPescaBadge, 600000);

// --- BEAUFORT DESCRIPTION ---
(function() {
    const bfDescs = [
        'Calma', 'Ventolina', 'Brisa muy débil', 'Brisa débil',
        'Brisa moderada', 'Brisa fresca', 'Brisa fuerte', 'Viento fresco',
        'Temporal', 'Temporal fuerte', 'Temporal muy fuerte', 'Borrasca', 'Huracán'
    ];
    const bfEl = document.querySelector('[data-widget="beaufort"] .metrica-sub');
    if (bfEl && typeof beaufortValor !== 'undefined') {
        const desc = bfDescs[beaufortValor] || '';
        bfEl.textContent = `BF ${beaufortValor} · ${desc}`;
    }

    // --- SEA STATE DESCRIPTION on olas widget ---
    const olasEl = document.querySelector('[data-widget="olas"] .metrica-sub');
    if (olasEl && typeof olaMax !== 'undefined') {
        const wmoDesc = olaMax < 0.1 ? 'Calma (glassy)' :
                        olaMax < 0.5 ? 'Calma (rizada)' :
                        olaMax < 1.25 ? 'Marejadilla' :
                        olaMax < 2.5 ? 'Marejada' :
                        olaMax < 4.0 ? 'Fuerza 5' :
                        olaMax < 6.0 ? 'Gruesa' :
                        olaMax < 9.0 ? 'Muy gruesa' : 'Enorme';
        olasEl.textContent = `${wmoDesc} · Mín ${olaMin}m`;
    }
})();

// --- SETTINGS ---
let tempUnit = localStorage.getItem('tempUnit') || 'c';
let windUnit = localStorage.getItem('windUnit') || 'kmh';
let lang = localStorage.getItem('lang') || 'es';

function setTempUnit(unit) {
    tempUnit = unit;
    localStorage.setItem('tempUnit', unit);
    ['c','f'].forEach(u => document.getElementById(`btn-${u}`)?.classList.toggle('active', u===unit));
    const val = unit==='f' ? Math.round(tempC*9/5+32) : tempC;
    const sVal = unit==='f' ? Math.round(sensacionC*9/5+32) : sensacionC;
    document.getElementById('temp-valor').textContent = val + '°';
    document.getElementById('sensacion').textContent = sVal + '°' + unit.toUpperCase();
    document.getElementById('temp-btn').textContent = '°' + unit.toUpperCase();
}

function setWindUnit(unit) {
    windUnit = unit;
    localStorage.setItem('windUnit', unit);
    ['kmh','kn','ms'].forEach(u => document.getElementById(`btn-${u}`)?.classList.toggle('active', u===unit));
}

function setLang(l) {
    lang = l;
    localStorage.setItem('lang', l);
    ['es','en'].forEach(u => document.getElementById(`btn-${u}`)?.classList.toggle('active', u===l));
}

function renderSettingsWidgets() {
    const grid = document.getElementById('config-grid-settings');
    if (!grid) return;
    grid.innerHTML = '';
    Object.entries(WIDGET_NOMBRES).forEach(([key, nombre]) => {
        const activo = prefsActuales[key] !== false;
        grid.innerHTML += `<div class="config-item"><span>${nombre}</span>
            <button class="toggle-btn ${activo?'on':'off'}" onclick="toggleWidget('${key}')">
            ${activo?'ON':'OFF'}</button></div>`;
    });
}

setTempUnit(tempUnit);
setWindUnit(windUnit);
setLang(lang);

// --- PARTE METEOROLÓGICO BRIEFING ---
function mostrarBriefing() {
    const modal = document.getElementById('briefing-modal');
    const textEl = document.getElementById('briefing-text');
    if (!modal || !textEl) return;
    modal.style.display = 'flex';
    textEl.textContent = 'Cargando parte meteorológico...';
    fetch('/api/briefing')
        .then(r => r.json())
        .then(d => {
            if (d.briefing) {
                textEl.textContent = d.briefing;
            } else if (d.error) {
                textEl.textContent = 'Error: ' + d.error;
            }
        })
        .catch(err => { textEl.textContent = 'Error de conexión.'; });
}

// Close briefing modal on backdrop click
document.addEventListener('click', e => {
    const modal = document.getElementById('briefing-modal');
    if (modal && e.target === modal) modal.style.display = 'none';
});

// --- VIGILANCIA ALERT BADGE in submenu tab ---
function loadVigilanciaAlerts() {
    fetch('/api/vigilancia_log?limit=10')
        .then(r => r.json())
        .then(d => {
            const log = d.log || [];
            const recentAlerts = log.filter(e => {
                // Count alerts in last 2h
                const ts = new Date(e.ts + 'Z');
                return (Date.now() - ts.getTime()) < 7200000 && e.amenaza !== 'VERDE';
            });
            // Find the vigilancia submenu button (9th button, index 8)
            const vigBtn = document.querySelectorAll('.submenu-btn')[8];
            if (!vigBtn) return;
            // Remove old badge
            const existing = vigBtn.querySelector('.vig-alert-badge');
            if (existing) existing.remove();
            if (recentAlerts.length > 0) {
                const badge = document.createElement('span');
                badge.className = 'vig-alert-badge';
                badge.style.cssText = 'background:#ef4444;color:white;font-size:0.55rem;padding:1px 5px;border-radius:8px;font-weight:700;margin-left:3px';
                badge.textContent = recentAlerts.length;
                vigBtn.querySelector('.submenu-label')?.after(badge);
            }
        })
        .catch(() => {});
}
loadVigilanciaAlerts();
setInterval(loadVigilanciaAlerts, 300000);