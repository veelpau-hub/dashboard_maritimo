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

## Iteración 2 (2026-04-30, ~20:09-20:15 UTC)

### Fase 2A — Crítica iter 2
- Nuevos gaps: capas SST en mapa, skeleton sin transición suave, indicador LIVE, presión trend sin inicializar, destino/ETA en AIS
- Actualizado docs/critique.md con iter 2 análisis

### Fase 2B/2C deeper
- AIS stream actualizado para capturar ShipStaticData (tipo, destino, calado, indicativo)
- Suscripción ahora incluye PositionReport + ShipStaticData

### Fase 3 iter 2 — Competitivas nuevas
- Rosa de dirección del oleaje (D3 polar chart con flecha direccional y headless marker)
- UV index + recomendación protección solar (5 niveles: Bajo/Moderado/Alto/Muy alto/Extremo)
- Curva sinusoidal de mareas con coseno interpolation y línea de tiempo actual
- LIVE badge pulsante en tabs AIS y Vigilancia
- Skeleton loading animado al cambiar de sub-tab
- Timestamp "Actualizado: HH:MM:SS" al pie de cada panel
- AIS tabla con columna Destino (de ShipStaticData)

### Iteración 3 (2026-04-30, ~20:15 UTC)

#### Pesca iter 2
- Solunar theory: 4 períodos diarios (2 mayores + 2 menores) desde cálculo astronómico puro
- Integración tendencia barométrica en el scoring de pesca ("presión bajando → picada activa")
- Iconos de especie por categoría en lugar de emoji genérico

#### Meteo mejorado
- Resumen de condiciones actuales en cards (temperatura, viento, presión, precipitación total)
- Gráfico de presión barométrica (7 días, violeta)

#### Presión trend
- Bootstrap con datos históricos de 24h desde Open-Meteo en thread daemon al arrancar
- El trend ya tiene datos reales desde el primer acceso

### Iteración 4 (2026-04-30, ~20:15 UTC)

#### AIS mejorado
- Búsqueda por nombre de buque en tiempo real (input con filtrado inmediato)
- Filtro por velocidad (todos / en movimiento / fondeados)
- Contador de buques en título de la sección
- Links a MarineTraffic por MMSI en todas las tablas

#### Oleaje mejorado  
- Categoría de energía de ola (calma/moderado/fuerte) calculada como H²×T
- Período de ola con animación pulse sincronizada al período real (CSS keyframes variables)

### Iteración 5 (2026-04-30, ~20:17 UTC)

#### Waypoints manager (Navionics-style)
- Backend: tabla SQLite `waypoints` (id, nombre, lat, lon, descripcion, color, creado)
- API REST: GET /api/waypoints, POST /api/waypoints, DELETE /api/waypoints/{id}
- Frontend: panel inline en map-controls para añadir waypoint haciendo clic en el mapa
- Marcadores de colores personalizados en Mapbox
- Toggle para mostrar/ocultar waypoints de usuario
- 2 nuevos tests: test_waypoints_crud, test_waypoints_invalid_coords

### Iteración 6 (2026-04-30, ~20:18 UTC)

#### PWA offline support
- Service Worker: cache-first para assets estáticos, network-first con fallback para API
- Web App Manifest: nombre, short_name, colores, orientación
- Ruta Flask /sw.js con header Service-Worker-Allowed
- Meta tags PWA en HTML (theme-color, description)
- El dashboard es ahora instalable como app en móvil

### Iteración 7 (2026-04-30, ~20:20 UTC)

#### AIS + Vigilancia mejorados
- 30+ códigos AIS tipo → nombres en español (pesca, cargo, tanquero, SAR, práctico...)
- Columna "Tipo" en tabla Vigilancia con nombre legible
- Links a MarineTraffic por MMSI en tabla Vigilancia
- AQI gradient bar: barra de colores (verde→rojo) para visualización del índice

### Iteración 8 (2026-04-30, ~20:21 UTC)

#### Tab "Hoy" — Ventana meteorológica 24h
- Nueva función fetch_hoy: combina Open-Meteo forecast + marine por hora del día actual
- Score 0-10 por hora: viento (<15=3, <25=2, <35=1), olas (<0.8m=3, <1.5m=2, <2.5m=1), precipitación (<0.5mm=2), código climático (no mal tiempo=2)
- renderHoy(): timeline de 24 barras con color verde/amarillo/rojo según score
- Summary cards: horas excelentes/aceptables/malas del día
- Nuevo sub-tab "📅 Hoy" al inicio del submenu

---

---

## Iteración 14 (2026-05-01, ~07:28 UTC)

### Estado al inicio
- 13 iteraciones completadas, 13 commits
- Iter 13: etiquetas Beaufort + descripciones WMO sea state en overview widgets
- Pendientes: registro de capturas, routing meteorológico, corrientes oceánicas, log vigilancia

### Fase 2A — Crítica iter 14
Gaps nuevos identificados:
- **Registro de capturas de pesca** — fishermen want to log catches with conditions (MarineTraffic Pro tiene esto)
- **Routing meteorológico** — ruta A→B con timeline condiciones por hora (PredictWind lo tiene, nosotros no)
- **Corrientes oceánicas overlay** — Open-Meteo Marine API tiene ocean_current_velocity/direction GRATIS
- **Log de vigilancia** — eventos de entrada/salida en zona ROZ deberían guardarse en SQLite
- **Briefing diario** — el endpoint /api/briefing existe pero no está expuesto en el UI
- **Tab 'Mañana'** — igual que 'Hoy' pero para mañana, muy demandado por navegantes
- **Predicción 10 días** — Open-Meteo permite 16 días, estamos mostrando solo 7

### Fase 2B — Vigilancia mejorada
- Log de incidencias SQLite: cada vez que un buque ROJO/AMARILLO nuevo aparece, se registra
- Endpoint /api/vigilancia_log — devuelve últimas 50 entradas del log
- Export CSV del log desde frontend con botón
- Badge contador de alertas en pestaña vigilancia

### Fase 2C — Registro de capturas de pesca
- Tabla `capturas` en SQLite: id, especie, peso_kg, longitud_cm, lat, lon, fecha, condiciones_json
- API REST: GET /api/capturas, POST /api/capturas, DELETE /api/capturas/{id}
- Frontend: formulario de registro en tab pesca, lista de capturas con condiciones del día
- Estadísticas: total capturas por especie, mejor mes para cada especie según historial propio

### Fase 3 — Features competitivas
1. **Corrientes oceánicas overlay** en mapa (Open-Meteo Marine API - gratis):
   - Flechas de dirección + velocidad en la cuadrícula del mapa
   - Toggle en map-controls
   - Color según velocidad (azul claro → azul oscuro)

2. **Routing meteorológico** básico:
   - Usuario dibuja ruta de 2 puntos en el mapa (clic inicio, clic fin)
   - Backend calcula condiciones hora a hora a lo largo de la ruta
   - Timeline de 24h: viento, olas, puntuación en cada punto de la ruta
   - Muestra ventana óptima de salida

3. **Tab 'Mañana'** en el menú:
   - Mismo formato que 'Hoy' (fetch_hoy) pero para el día siguiente
   - Re-usar fetch_hoy con parámetro de fecha

## Próximas iteraciones — Ideas pendientes

- Mareas reales desde Puertos del Estado (boya 3304 Rota)
- Datos boya real Cádiz (vs modelo Open-Meteo)
- Batimetría overlay en el mapa
- Notificaciones push (viento > X kt, oleaje > Xm)
- Exportar datos a CSV/PDF
- Comparativa histórica (año anterior)
