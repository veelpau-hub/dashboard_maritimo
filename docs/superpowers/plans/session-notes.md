# Session Notes — Dashboard Marítimo

## Iteración 1 (2026-04-30, ~20:00-21:30 UTC)

### Estado al inicio
- Tests: 1 de 6 fallando (NameError: AISHUB_USER no definido en app.py)
- CSS responsive: parcial (solo media query móvil básica, sin hamburger)
- Sub-tabs vigilancia y pesca: botones presentes pero sin backend ni renderizadores
- Sin historial AIS, sin animación de viento, sin tendencia de presión

### Fase 1 — Responsive layout
- Corregido bug crítico: `AISHUB_USER` faltaba en app.py (NameError en producción)
- Añadido botón hamburger fijo (`position:fixed`, top-left) visible solo en móvil
- Sidebar en móvil: overlay que se desliza desde la izquierda (transform translateX)
- Overlay semitransparente que cierra el sidebar al hacer clic
- Breakpoint tablet (768-1200px): sidebar solo iconos, submenu icons-only, forecast 4 cols
- Breakpoint escritorio (>1200px): layout completo como diseñado
- ResizeObserver en todos los gráficos D3 para redibujar al cambiar tamaño
- Tabla AIS: contenedor con clase `ais-table-wrap` y overflow-x auto
- Forecast grid: 2 cols móvil, 4 cols tablet, 7 cols escritorio
- Submenu en móvil: fila horizontal scrollable (overflow-x auto, no-wrap)

### Fase 2A — Crítica brutal
- Creado `docs/critique.md` con análisis honesto de:
  - Features inútiles: ad slots vacíos, Ko-fi banner, Beaufort sin contexto
  - Problemas amateur: XSS en innerHTML, tabla AIS sin MMSI, mareas stub, sin timestamps
  - Features críticas faltantes: mareas reales, alerta barométrica, temp agua histórica
  - Comparativa detallada vs Windy / MarineTraffic / PredictWind / Navionics

### Fase 2B — Vigilancia militar
Backend `/api/dashboard/vigilancia`:
- Clasificación amenaza: ROJO (military type 35-37), AMARILLO (sin nombre o tipo desconocido), VERDE (comercial conocido)
- Historial de posiciones: últimas 10 posiciones por buque en `_ais_history`
- Estado de buque: EN MOVIMIENTO (SOG>0.5kt) / FONDEADO / DESCONOCIDO
- Detección FUERA DE RANGO: buques vistos en últimos 30min con SOG>3kt que ya no aparecen
- Estadísticas: total, rojo, amarillo, verde

Frontend:
- Overlay ROZ Rota en mapa: polígono de 5nm de radio desde 36.6367N, 6.3493W (rojo semitransparente)
- Toggle "🚫 Zona ROZ" en map-controls
- renderVigilancia(): tabla multi-buque con badges de amenaza/estado, sección FUERA DE RANGO
- Colores AIS en mapa según nivel de amenaza (rojo/amarillo/verde)

### Fase 2C — Pesca
Backend `/api/dashboard/pesca`:
- Índice condiciones 1-10: olas (<1m=2pts), viento (<15kmh=2pts), marea entrante/saliente=2pts, visibilidad (>5km=2pts), +2pts base
- Go/No-Go: olas>2m=NO, viento>25kmh=NO, presión<995=NO
- Mejores horas: ±1h alrededor de cada extremo de marea + 30min tras amanecer/antes ocaso
- Fase lunar: algoritmo puro (sin API externa), referencia Luna Nueva 6 Jan 2000
- Calendario de especies: JSON hardcoded 12 especies Bahía de Cádiz × meses
- Sparkline temperatura agua (últimas lecturas del caché oleaje)

Frontend:
- renderPesca(): tarjeta índice con número grande coloreado, go/nogo en grande, fase lunar con icono, horas óptimas con badges, especies en temporada como cards

### Fase 3 — Features competitivas
1. Animación de partículas de viento (canvas 2D sobre el mapa):
   - 180 partículas con trail fade
   - Velocidad y dirección desde datos reales (vientoGrados, vientoKmh)
   - Color cambia según velocidad (verde → naranja → rojo)
   - Toggle "💨 Viento" en map-controls

2. Historial de trazas AIS (polyline):
   - Backend guarda últimas 10 posiciones por buque en `_ais_history`
   - Al hacer clic en un marcador AIS se muestra la polilínea del recorrido
   - Popup incluye enlace a MarineTraffic por MMSI
   - Coordenadas del cursor en esquina inferior del mapa

3. Tendencia de presión barométrica + alerta de tormenta:
   - Backend mantiene historial de 6 lecturas para calcular delta hPa/h
   - `/api/presion_trend` devuelve trend + delta + flag de alerta
   - Widget presión en overview muestra badge ↑/↓/→ con velocidad de cambio
   - Banner rojo fijo en la página si presión < 1000 hPa o cae > 3 hPa/h
   - Refresco cada 5 minutos

### Seguridad aplicada
- Función `esc()` en dashboard.js para sanitizar todos los datos externos antes de innerHTML
- nivel de alerta sanitizado a whitelist en renderAlertas
- Popup de mapa AIS usa replace() manual sin innerHTML de datos brutos
- MMSI en links solo permite caracteres numéricos

### Tests
- 8 tests, 8 passed
- Nuevos: test_dashboard_vigilancia, test_dashboard_pesca
- Corregida deprecación datetime.utcnow() → datetime.now(timezone.utc)

### Commits de esta sesión
1. `feat: responsive layout — mobile hamburger, breakpoints 768/1200, D3 resize`
2. `docs: critique iter 1 — gaps vs Windy/MarineTraffic/PredictWind, security issues, missing features`
3. `feat: vigilancia iter 1 + pesca iter 1`
4. `feat: competitive iter 1 — wind particle animation canvas, AIS vessel history trail, barometric pressure trend + storm alert`

---

## Próximas iteraciones — Ideas pendientes

- Mareas reales desde Puertos del Estado (boya 3304 Rota)
- Datos boya real Cádiz (vs modelo Open-Meteo)
- Rosa de dirección del oleaje (D3 polar chart)
- Índice UV + recomendación solar
- Capas de corrientes oceánicas (Copernicus CMEMS free)
- PWA / modo offline con Service Worker
- Waypoints guardables por el usuario
- Routing meteorológico (línea de tiempo de condiciones a lo largo de una ruta)
- Batimetría overlay en el mapa
