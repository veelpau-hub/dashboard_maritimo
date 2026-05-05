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
            // Check toast for pressure
            if (d.alert) checkConditionAlerts({presion_trend: d});
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
            checkConditionAlerts(d);
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

// --- CHANGELOG ---
function mostrarChangelog() {
    const modal = document.getElementById('changelog-modal');
    if (modal) modal.style.display = 'flex';
}
document.addEventListener('click', e => {
    const modal = document.getElementById('changelog-modal');
    if (modal && e.target === modal) modal.style.display = 'none';
});

// --- FULLSCREEN ---
function toggleFullscreen() {
    const btn = document.getElementById('fullscreen-btn');
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            if (btn) btn.textContent = 'Desactivar';
        }).catch(() => {});
    } else {
        document.exitFullscreen().then(() => {
            if (btn) btn.textContent = 'Activar';
        }).catch(() => {});
    }
}
document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('fullscreen-btn');
    if (btn) btn.textContent = document.fullscreenElement ? 'Desactivar' : 'Activar';
});

// --- COMPARTIR ESTADO ---
function compartirEstado() {
    const params = new URLSearchParams();
    if (window.geoCoords) {
        params.set('lat', window.geoCoords.lat.toFixed(4));
        params.set('lon', window.geoCoords.lon.toFixed(4));
    }
    const url = window.location.origin + window.location.pathname + (params.toString() ? '?' + params : '');
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('URL copiada al portapapeles.', 'info', 3000);
        }).catch(() => {
            prompt('Copia esta URL:', url);
        });
    } else {
        prompt('Copia esta URL:', url);
    }
}

// --- ALERT THRESHOLDS (user-configurable) ---
let alertSettings = {
    olaMax: parseFloat(localStorage.getItem('alert_ola_max') || '2.0'),
    vientoMax: parseFloat(localStorage.getItem('alert_viento_max') || '25'),
    presionMin: parseFloat(localStorage.getItem('alert_presion_min') || '995'),
};

function saveAlertSettings() {
    alertSettings.olaMax = parseFloat(document.getElementById('alert-ola-max')?.value || '2.0');
    alertSettings.vientoMax = parseFloat(document.getElementById('alert-viento-max')?.value || '25');
    alertSettings.presionMin = parseFloat(document.getElementById('alert-presion-min')?.value || '995');
    localStorage.setItem('alert_ola_max', alertSettings.olaMax);
    localStorage.setItem('alert_viento_max', alertSettings.vientoMax);
    localStorage.setItem('alert_presion_min', alertSettings.presionMin);
    showToast('Umbrales de alerta guardados.', 'info', 3000);
}

function loadAlertSettingsUI() {
    const olaEl = document.getElementById('alert-ola-max');
    const vientoEl = document.getElementById('alert-viento-max');
    const presionEl = document.getElementById('alert-presion-min');
    if (olaEl) olaEl.value = alertSettings.olaMax;
    if (vientoEl) vientoEl.value = alertSettings.vientoMax;
    if (presionEl) presionEl.value = alertSettings.presionMin;
}
// Load alert settings when settings panel opens
const _origSwitchTab = switchTab;
window.switchTab = function(tab) {
    _origSwitchTab(tab);
    if (tab === 'settings') loadAlertSettingsUI();
};

setTempUnit(tempUnit);
setWindUnit(windUnit);
setLang(lang);

// --- TOAST NOTIFICATION SYSTEM ---
let _toastContainer = null;
const _shownToasts = new Set();

function showToast(msg, type = 'info', duration = 6000) {
    if (!_toastContainer) {
        _toastContainer = document.createElement('div');
        _toastContainer.id = 'toast-container';
        _toastContainer.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column-reverse;gap:0.5rem;max-width:320px';
        document.body.appendChild(_toastContainer);
    }
    const colors = {info: '#4AC8E8', warning: '#f59e0b', error: '#ef4444'};
    const color = colors[type] || '#4AC8E8';
    const toast = document.createElement('div');
    toast.style.cssText = `background:rgba(13,21,32,0.97);border:1px solid ${color};border-left:4px solid ${color};border-radius:8px;padding:0.6rem 1rem;font-size:0.75rem;color:white;cursor:pointer;transition:opacity 0.3s;box-shadow:0 4px 20px rgba(0,0,0,0.5)`;
    toast.innerHTML = `<strong style="color:${color}">${type === 'error' ? 'ALERTA' : type === 'warning' ? 'AVISO' : 'INFO'}</strong> ${msg}`;
    toast.onclick = () => toast.remove();
    _toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, duration);
}

// Check conditions and fire toasts
let _prevOlaMax = null;
let _prevPresion = null;

function checkConditionAlerts(datos) {
    const olaMax = datos?.altura_max;
    const presion = datos?.presion;
    const presionTrend = datos?.presion_trend;
    const viento = datos?.viento_kmh;

    // Toast if waves exceeded threshold
    const olaThreshold = alertSettings?.olaMax ?? 2.0;
    if (olaMax != null && _prevOlaMax != null && _prevOlaMax < olaThreshold && olaMax >= olaThreshold) {
        const key = `olas_${Math.floor(Date.now()/60000)}`;
        if (!_shownToasts.has(key)) {
            _shownToasts.add(key);
            showToast(`Olas superaron ${olaThreshold}m (${olaMax.toFixed(1)}m). Precaución para navegación costera.`, 'warning', 8000);
        }
    }
    _prevOlaMax = olaMax;

    // Toast if wind exceeded threshold
    const vientoThreshold = alertSettings?.vientoMax ?? 25;
    if (viento != null && viento >= vientoThreshold) {
        const key = `viento_${Math.floor(Date.now()/600000)}`; // every 10min
        if (!_shownToasts.has(key)) {
            _shownToasts.add(key);
            showToast(`Viento fuerte: ${viento.toFixed(0)} km/h (umbral: ${vientoThreshold} km/h).`, 'warning', 7000);
        }
    }

    // Toast if pressure alarm
    const presionThreshold = alertSettings?.presionMin ?? 995;
    if (presionTrend?.alert || (presion != null && presion < presionThreshold)) {
        const key = `presion_alert_${Math.floor(Date.now()/300000)}`;
        if (!_shownToasts.has(key)) {
            _shownToasts.add(key);
            const delta = presionTrend?.delta_h || 0;
            const msg = presionTrend?.alert
                ? `Presión barométrica en descenso rápido (${delta} hPa/h). Posible deterioro del tiempo.`
                : `Presión baja: ${presion?.toFixed(0)} hPa (umbral: ${presionThreshold} hPa).`;
            showToast(msg, 'error', 10000);
        }
    }
}

// --- SCORE DÍA BADGE ---
function loadScoreDia() {
    fetch('/api/score_dia')
        .then(r => r.json())
        .then(d => {
            const badge = document.getElementById('score-dia-badge');
            if (!badge) return;
            badge.style.color = d.color || '#888';
            badge.style.borderColor = (d.color || '#888').replace(')', ',0.3)').replace('rgb','rgba');
            badge.textContent = `${d.score}/100 · ${d.label || ''}`;
            badge.title = `Score día: ${d.score}/100 — ${d.label}. Olas: ${d.details?.wave_h}m · Viento: ${d.details?.wind_kmh}km/h · Presión: ${d.details?.presion}hPa`;
        })
        .catch(() => {});
}
loadScoreDia();
setInterval(loadScoreDia, 300000);

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

// --- MAREA REMINDER (fishing alert) ---
let _prevMareaCountdown = null;
function checkMareaReminder(mareaData) {
    if (!mareaData) return;
    const countdown = mareaData.countdown;  // "01h 25m"
    const proximo = mareaData.proximo_tipo;
    if (!countdown || !proximo) return;
    // Parse countdown to minutes
    const match = countdown.match(/(\d+)h\s*(\d+)m/);
    if (!match) return;
    const mins = parseInt(match[1]) * 60 + parseInt(match[2]);
    // Toast when <= 90 minutes to next extreme
    if (mins <= 90 && mins > 60) {
        const key = `marea_${Math.floor(Date.now()/1800000)}`; // every 30min
        if (!_shownToasts?.has(key)) {
            _shownToasts?.add(key);
            const tipo = proximo === 'pleamar' ? 'Pleamar' : 'Bajamar';
            showToast(`${tipo} en ${countdown}. Ventana de pesca óptima próxima.`, 'info', 8000);
        }
    }
}

// --- MAREAS ESTADO WIDGET (overview) ---
function loadMareasEstado() {
    fetch('/api/mareas_estado')
        .then(r => r.json())
        .then(d => {
            const container = document.getElementById('mareas-state-container');
            const nextText = document.getElementById('mareas-next-text');
            if (!container) return;

            const estadoColors = {entrante:'#22c55e', saliente:'#f59e0b', parada:'#4AC8E8', desconocido:'rgba(255,255,255,0.3)'};
            const estadoLabel = {entrante:'ENTRANTE', saliente:'SALIENTE', parada:'PARADA', desconocido:'?', error:'ERROR'};
            const color = estadoColors[d.estado] || '#888';
            const label = estadoLabel[d.estado] || d.estado;

            container.innerHTML = `<div style="font-size:1.1rem;font-weight:700;color:${color}">${label}</div>`;

            if (nextText) {
                const tipo = d.proximo_tipo === 'pleamar' ? 'Pleamar' : d.proximo_tipo === 'bajamar' ? 'Bajamar' : 'Próxima';
                const h = d.proximo_height != null ? ` · ${parseFloat(d.proximo_height).toFixed(1)}m` : '';
                const countdown = d.countdown ? ` en ${d.countdown}` : '';
                nextText.textContent = d.proximo_time ? `${tipo} ${d.proximo_time}${h}${countdown}` : 'Sin datos';
            }
            checkMareaReminder(d);
        })
        .catch(() => {});
}
loadMareasEstado();
setInterval(loadMareasEstado, 300000);

// --- AIS STATUS INDICATOR ---
function loadAISStatus() {
    if (!document.getElementById('ais-status-indicator')) return;
    fetch('/api/ais_status')
        .then(r => r.json())
        .then(d => {
            const el = document.getElementById('ais-status-indicator');
            if (!el) return;
            if (d.connected && d.last_message_age_s != null && d.last_message_age_s < 120) {
                el.style.background = '#22c55e';
                el.title = `AIS conectado · ${d.vessel_count} buques · último mensaje hace ${d.last_message_age_s}s`;
            } else {
                el.style.background = d.connected ? '#f59e0b' : '#ef4444';
                el.title = d.connected ? 'AIS conectado (sin datos recientes)' : 'AIS desconectado';
            }
        })
        .catch(() => {});
}

loadAISStatus();
setInterval(loadAISStatus, 60000);

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

// --- VIGILANCIA OVERVIEW WIDGET ---
function loadVigilanciaOverview() {
    const container = document.getElementById('vigilancia-estado-container');
    const subText = document.getElementById('vigilancia-sub-text');
    if (!container) return;
    fetch('/api/dashboard/vigilancia')
        .then(r => r.json())
        .then(d => {
            const rojo = d.rojo || 0;
            const amarillo = d.amarillo || 0;
            const total = d.total || 0;
            const enRoz = d.en_roz || 0;
            const intercept = d.interceptacion || 0;

            let stateColor = '#22c55e';
            let stateLabel = 'NORMAL';
            if (intercept > 0) { stateColor = '#ef4444'; stateLabel = 'ALERTA'; }
            else if (rojo > 0 || enRoz > 0) { stateColor = '#ef4444'; stateLabel = 'ROJO'; }
            else if (amarillo > 0) { stateColor = '#f59e0b'; stateLabel = 'AMARILLO'; }

            const widget = document.getElementById('widget-vigilancia');
            if (widget) {
                widget.style.borderColor = stateColor + '44';
                if (intercept > 0) widget.style.animation = 'pulse 1s infinite';
                else widget.style.animation = '';
            }

            container.innerHTML = `<div style="font-size:1.0rem;font-weight:700;color:${stateColor}">${stateLabel}</div>
                <div style="display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.2rem">
                    ${rojo > 0 ? `<span style="background:#ef4444;color:white;font-size:0.55rem;padding:1px 5px;border-radius:8px">${rojo} ROJO</span>` : ''}
                    ${amarillo > 0 ? `<span style="background:#f59e0b;color:white;font-size:0.55rem;padding:1px 5px;border-radius:8px">${amarillo} AMR</span>` : ''}
                    ${enRoz > 0 ? `<span style="background:rgba(239,68,68,0.6);color:white;font-size:0.55rem;padding:1px 5px;border-radius:8px">${enRoz} ROZ</span>` : ''}
                </div>`;
            if (subText) subText.textContent = `${total} buques en área`;
        })
        .catch(() => {});
}
loadVigilanciaOverview();
setInterval(loadVigilanciaOverview, 300000);

// --- CORRIENTES OVERVIEW WIDGET ---
function loadCorrientesOverview() {
    const container = document.getElementById('corrientes-container');
    if (!container) return;
    fetch('/api/dashboard/corrientes')
        .then(r => r.json())
        .then(d => {
            const vel = d.current_vel;
            const dir = d.current_dir;
            if (vel == null) {
                container.innerHTML = '<div style="font-size:0.8rem;color:rgba(255,255,255,0.3)">Sin datos</div>';
                return;
            }
            const velColor = vel < 0.5 ? '#22c55e' : vel < 1.0 ? '#f59e0b' : '#ef4444';
            const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
            const dirName = dir != null ? dirs[Math.round(dir / 22.5) % 16] : '-';
            container.innerHTML = `<div style="font-size:1.1rem;font-weight:700;color:${velColor}">${vel.toFixed(2)} m/s</div>
                <div style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-top:0.1rem">${dirName} · ${dir != null ? dir.toFixed(0) + '°' : '-'}</div>`;
        })
        .catch(() => {});
}
loadCorrientesOverview();
setInterval(loadCorrientesOverview, 600000);