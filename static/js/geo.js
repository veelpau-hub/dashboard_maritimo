window.geoCoords = null;

function detectarUbicacion() {
    const btn = document.getElementById('geo-btn');
    const indicator = document.getElementById('geo-indicator');
    if (!navigator.geolocation) {
        if (indicator) indicator.textContent = 'Geolocalización no disponible';
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Detectando...'; }

    navigator.geolocation.getCurrentPosition(
        pos => {
            const { latitude, longitude } = pos.coords;
            fetch(`/api/localize?lat=${latitude}&lon=${longitude}`)
                .then(r => r.json())
                .then(d => {
                    window.geoCoords = { lat: d.coastal_lat, lon: d.coastal_lon };

                    // Actualizar título y coords del overview
                    const title = document.getElementById('panel-title');
                    const coords = document.getElementById('panel-coords');
                    if (title) title.textContent = d.name;
                    if (coords) coords.textContent =
                        `${d.coastal_lat.toFixed(4)}° N | ${Math.abs(d.coastal_lon).toFixed(4)}° ${d.coastal_lon < 0 ? 'W' : 'E'}`;

                    // Volar el mapa a la ubicación costera
                    if (window.mapa) window.mapa.flyTo({
                        center: [d.coastal_lon, d.coastal_lat],
                        zoom: 11, pitch: 40, bearing: 0, duration: 2000
                    });

                    if (indicator) indicator.textContent =
                        `📍 ${d.name} — ${d.distance_km} km de la costa`;
                    if (btn) { btn.textContent = `📍 ${d.name}`; btn.disabled = false; }
                    if (typeof currentDashTab === 'string' && currentDashTab)
                        switchDashTab(currentDashTab);

                    // Show nearby ports
                    loadPuertosCercanos(latitude, longitude);
                })
                .catch(() => {
                    if (indicator) indicator.textContent = 'Error al localizar';
                    if (btn) { btn.textContent = '📍 Mi ubicación'; btn.disabled = false; }
                });
        },
        () => {
            if (indicator) indicator.textContent = 'Ubicación denegada';
            if (btn) { btn.textContent = '📍 Mi ubicación'; btn.disabled = false; }
        },
        { timeout: 10000, maximumAge: 300000 }
    );
}

function loadPuertosCercanos(lat, lon) {
    fetch(`/api/puertos_cercanos?lat=${lat}&lon=${lon}`)
        .then(r => r.json())
        .then(data => {
            const puertos = data.puertos || [];
            if (!puertos.length) return;
            // Show in geo-indicator as tooltip or small pill list
            let container = document.getElementById('puertos-cercanos');
            if (!container) {
                container = document.createElement('div');
                container.id = 'puertos-cercanos';
                container.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px';
                const geoBar = document.querySelector('.geo-bar');
                if (geoBar) geoBar.after(container);
            }
            container.innerHTML = puertos.slice(0, 5).map(p =>
                `<span style="font-size:0.65rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:2px 8px;color:rgba(255,255,255,0.55)" title="${p.distancia_km} km">${p.name} ${p.distancia_km}km</span>`
            ).join('');
        })
        .catch(() => {});
}
