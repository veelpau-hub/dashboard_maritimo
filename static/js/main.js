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