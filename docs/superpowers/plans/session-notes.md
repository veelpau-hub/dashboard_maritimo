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

---

## Iteración 15 (2026-05-01, ~07:33 UTC)

### Fase 2A — Crítica iter 15
- `/api/briefing` existe en backend pero NO está en el UI — brecha obvia
- Predicción 7 días no muestra olas máximas (fetch_prediccion no incluye marine data)
- El routing no tiene nota de unidades de velocidad ni conversión kt/km
- El panel de corrientes es solo informativo — falta contexto "¿cómo afecta esto a mi barco?"
- Recomendaciones de cebo por especie/condición serían muy populares entre pescadores recreativos
- Fase lunar en pesca: cuarto creciente/menguante mejor para pesca que luna llena/nueva (dato incorrecto en la teoría solunar actual)
- Overview widget 'mareas' no muestra el estado actual (entrante/saliente) — solo tabla de extremos

### Fase 2B — Vigilancia: badge alertas + detección ROZ
- Badge contador (ROJO + AMARILLO) en el submenu tab vigilancia
- Función `_vessel_in_roz(lat, lon)`: detecta si un buque está DENTRO de la zona ROZ (5nm desde Rota)
- Si buque DENTRO de ROZ → evento especial en log: 'EN_ROZ'
- Widget overview: pequeño indicador "X buques en vigilancia activa" en la tarjeta de overview

### Fase 2C — Pesca: recomendaciones de cebo
- Dict `CEBO_RECOMENDADO` por especie en temporada + condición (fondo/superficie/media agua)
- Función `get_cebo_recomendado(especie, wave_h, wind_kmh)` → cebo óptimo + técnica
- Añadido a la tarjeta de cada especie en renderPesca

### Fase 3 — Features competitivas
1. **Briefing diario en Overview**: botón "Ver parte" que abre modal con texto del briefing
2. **Predicción con olas máximas**: combinar Open-Meteo weather + Marine en fetch_prediccion
3. **Mareas widget en overview**: mostrar estado actual (ENTRANTE/SALIENTE/PARADA) como badge en el widget de mareas

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

---

## Iteración 16 (2026-05-01, ~07:36 UTC)

### Fase 2A — Crítica iter 16
- Modal briefing: el `display:none` en el style attr hace que `style.display='flex'` no funcione bien al reabrirlo — arreglar
- Predicción 7 días: los iconos son emoji, pero falta Beaufort por día (escala de viento relativa)
- El tab AIS dice "Sin buques detectados" pero no hay indicación de si el servicio AIS está conectado o simplemente hay pocas embarcaciones en el área
- El tab corrientes: el error "ocean_current_velocity not available" de Open-Meteo no se comunica bien al usuario
- Widget mareas en overview: actualmente el widget de mareas no existe — se muestra en Dashboard/Mareas pero el overview solo tiene la previsión de olas

### Fase 2B — Vigilancia: detalle de buque + ordenamiento
- Click en fila de la tabla → panel de detalles con todos los campos del buque + historial de posiciones formateado
- Ordenamiento de tabla por columna (nombre, amenaza, velocidad)

### Fase 2C — Pesca: export CSV capturas
- Botón "Exportar CSV" en el panel de capturas (similar al log de vigilancia)
- Mini-gráfico scatter: capturas propias vs ola (si hay >= 3 capturas con peso)

### Fase 3 — Mareas en Overview + AIS status indicator
1. **Widget mareas en Overview**: nueva tarjeta `widget data-widget="mareas"` que muestra:
   - Estado actual: ENTRANTE / SALIENTE / PARADA
   - Próxima pleamar/bajamar con countdown HH:MM
   - Badge verde/rojo según si es buena hora para pesca
2. **AIS status indicator**: icono pulsante cuando el stream AIS está conectado vs desconectado
3. **Ordenamiento tabla AIS/Vigilancia** por clic en cabeceras

---

## Iteración 17 (2026-05-01, ~07:39 UTC)

### Fase 2A — Crítica iter 17
- fetch_corrientes puede fallar si Open-Meteo no tiene ocean_current data para ese punto (la API devuelve datos vacíos para coords sin cobertura marina) — ya hay try/except pero el fallback puede mejorar
- El routing endpoint hace 6 API calls (3 puntos × 2 APIs) lo que puede ser lento — cachear por 10min
- La tabla AIS en el tab no muestra el tipo legible sino el código numérico — debería mostrar `type_name`
- El widget mareas no muestra el coeficiente en el overview

### Fase 2B — Vigilancia: export lista buques + tipo legible en AIS
- Botón "Exportar CSV" en tab AIS para exportar snapshot actual de buques
- Corrección: mostrar `type_name` en lugar de tipo numérico en tabla AIS

### Fase 2C — Pesca: temperatura agua y profundidad
- Añadir consejo de profundidad de pesca basado en temperatura del agua: <16°C = demersal fondo, 16-20°C = mixto, >20°C = pelágico superficie

### Fase 3 — SST overlay en mapa + puertos cercanos
1. **SST (Sea Surface Temperature) overlay**: grid de 5×5 puntos alrededor de Rota
   - Backend: /api/sst_grid devuelve array de {lat, lon, sst} para pintar en mapa
   - Frontend: círculos coloreados en mapa por temperatura (azul=frío, rojo=caliente)
   - Toggle "🌊 SST" en map-controls
2. **Puertos cercanos**: endpoint /api/puertos_cercanos?lat=X&lon=Y
   - Lista de puertos/marinas del COASTAL_POINTS con distancia desde posición usuario
   - Mostrado en overview cuando hay geolocalización activa

---

## Iteración 18 (2026-05-01, ~07:42 UTC)

### Fase 2A — Crítica iter 18
- Overview: no hay "score del día" como número visible — un navegante quiere saber de un vistazo si es buen día para salir
- El beaufort gauge en el overview solo muestra el número BF sin contexto visual
- El tab corrientes muestra error sin decir al usuario que ese punto puede no tener datos marinos
- El AIS type_name aparece en vigilancia como tipo numérico en algunos buques

### Fase 2B — Vigilancia: análisis de interceptación
- Para buques ROJO: calcular si el heading del buque apunta hacia la Base Naval (36.6367, -6.3493) dentro de las próximas 2h a su SOG actual
- Esto añade un campo `interceptacion_riesgo: true/false` y texto de alerta
- Añadir esto al log como evento 'RUMBO_ROZ'

### Fase 2C — Pesca: calendario visual de temporadas
- Tabla HTML 12 meses × N especies con color verde (en temporada) / gris (fuera de temporada)
- Se añade al tab pesca como nueva sección desplegable
- El mes actual se resalta

### Fase 3 — Score meteorológico + wind rose
1. **Score meteorológico diario** en overview:
   - Nuevo endpoint /api/score_dia: combina viento, olas, presión, visibilidad → score 0-100
   - Widget overview con número grande y color (verde/amarillo/rojo)
2. **Rosa de vientos polar** (mejora del widget de viento):
   - En lugar de solo la brújula, añadir mini polar chart de dirección + velocidad (D3)
   - Widget de viento ampliado en overview

---

## Iteración 19 (2026-05-01, ~07:45 UTC)

### Fase 2A — Crítica iter 19
- El submenu tiene 12 tabs — en móvil se desborda horizontalmente pero sin indicación visual de scroll
- Los umbrales de alerta (ola, viento, presión) están hardcoded — sería mejor que el usuario los configure
- No hay forma de marcar un buque AMARILLO como "conocido/aprobado" para reducir ruido en vigilancia

### Fase 2B — Vigilancia: lista de buques conocidos/aprobados
- Nueva tabla SQLite `buques_aprobados` (mmsi, nombre, motivo, creado)
- Si un buque está en la lista → se clasifica como VERDE aunque sea tipo desconocido
- Backend: GET/POST/DELETE /api/buques_aprobados
- Frontend: botón "Aprobar" en tabla vigilancia para buques AMARILLO

### Fase 2C — Pesca: notas en mejores horas
- Mejorar `fetch_pesca` para devolver best_hours como lista de objetos con {hora, nota} en lugar de solo string
- Nota incluye: "Pleamar 12:45" / "30min tras amanecer" / "Mejor solunar"

### Fase 3 — Sistema de toast notifications
- Función `showToast(msg, type, duration)` en main.js: crea div fijo bottom-right que desaparece
- Tipos: 'info', 'warning', 'error'
- Se dispara cuando:
  - Presión cae > 3 hPa/h (detectado en updatePresionTrend)
  - En auto-refresh: ola > 2m (si era < 2m antes)
  - En vigilancia: aparece buque ROJO nuevo

## Próximas iteraciones — Ideas pendientes

- Mareas reales desde Puertos del Estado (boya 3304 Rota)
- Datos boya real Cádiz (vs modelo Open-Meteo)
- Batimetría overlay en el mapa
- Exportar datos a CSV/PDF
- Comparativa histórica (año anterior)
