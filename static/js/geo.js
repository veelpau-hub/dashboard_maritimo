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
