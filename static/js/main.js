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

function switchTab(tab) {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('submenu').classList.remove('visible');
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));

    if (tab === 'overview') {
        document.getElementById('panel-overview').classList.remove('hidden');
        document.querySelectorAll('.sidebar-btn')[0].classList.add('active');
    } else if (tab === 'dashboard') {
        document.getElementById('panel-dashboard').classList.remove('hidden');
        document.getElementById('submenu').classList.add('visible');
        document.querySelectorAll('.sidebar-btn')[1].classList.add('active');
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