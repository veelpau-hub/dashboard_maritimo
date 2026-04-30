# Dashboard Marítimo — Crítica Brutal (Iter 1)

> Análisis honesto comparando con Windy.com, MarineTraffic, PredictWind y Navionics.

---

## 1. Lo inútil (features que no aportan valor real a un usuario en Rota)

- **Ad slots vacíos (728×90 + 160×600)**: sin aprobación de AdSense activa, son simplemente rectángulos punteados que parecen broken UI.
- **Ko-fi banner**: útil si hubiera comunidad de usuarios, pero para un dashboard privado/personal es ruido visual.
- **Beaufort widget en overview**: el número de Beaufort solo lo entiende gente del mar. Para uso cotidiano, km/h o nudos es más legible. Sin contexto textual ("Brisa fresca", "Temporal") no aporta.
- **Widget presión como arc**: el gauge arc de presión es difícil de leer con precisión. Una cifra grande con flecha tendencia (↑↓→) sería más útil.
- **Skeleton grids en overview**: están hardcodeados en HTML pero son reemplazados por widgets reales al cargarse. Crean flash de contenido innecesario.

---

## 2. Lo amateur (UX, visual o técnico)

- **Dashboard.js usa `innerHTML` con datos externos**: si `v.name` o `a.titulo` viniera de AIS/AEMET sin sanitizar, es XSS. Hay que escapar texto externo con `textContent` o una función escape.
- **Tabla AIS sin MMSI ni link**: MarineTraffic siempre muestra MMSI como link al perfil del buque. Falta totalmente.
- **Mareas con datos stub**: mostrar "06:30 Pleamar 2.8m" hardcodeado con nota "estimado" parece broken. Un usuario en Rota necesita mareas reales.
- **No hay indicación de última actualización**: ningún widget muestra cuándo se actualizaron los datos. Windy.com y PredictWind siempre muestran "Updated 5 min ago".
- **Gráficos D3 sin unidades en el eje Y**: los ejes solo muestran números sin "°C", "m", "km/h". Confuso a primera vista.
- **Forecast grid 7 días sin precipitación**: se muestra temp máx/mín y viento pero no lluvia. PredictWind muestra 8+ parámetros por día.
- **Sin modo offline/PWA**: Windy.app tiene Progressive Web App con datos en caché. Este dashboard falla completamente si no hay red.
- **Mapa sin escala ni coordenadas del cursor**: MarineTraffic siempre muestra lat/lon del puntero. Faltan controles básicos de navegación.
- **Panel overview sin scroll**: en pantallas de <900px altura los widgets se cortan sin scroll visible.
- **Brújula D3 demasiado pequeña (80px)**: en retina o pantallas 4K es borrosa. Debería ser SVG escalable con viewBox.

---

## 3. Lo que falta (crítico — sin esto la app está incompleta)

- **Mareas reales**: La API de Puertos del Estado (portus.puertos.es) es gratuita. Sin mareas precisas, un pescador o marinero no puede confiar en el dashboard para planificar maniobras de entrada/salida de puerto.
- **Alerta de tormenta barométrica**: si presión < 1000 hPa y bajando, debería aparecer banner rojo de alerta. PredictWind envía notificaciones push. Actualmente no hay ningún sistema de alertas visuales prominentes.
- **Estado del mar en tiempo real (buoy data)**: la Red de Boyas de Puertos del Estado (www.puertos.es/es-es/oceanografia/Paginas/portus.aspx) publica datos de oleaje real de la boya de Cádiz. Open-Meteo es un modelo — la boya son datos medidos.
- **Temperatura del agua histórica (7 días)**: solo se muestra un valor puntual. Un sparkline de evolución sería enormemente más útil para buceo/pesca.
- **No hay pronóstico de viento por horas del día**: el dashboard muestra promedios de 3h pero no hay vista "¿a qué hora sopla menos hoy?". Crítico para salidas en RIB/velero.
- **Sin integración con puertos/fondeaderos**: Navionics muestra fondeaderos, puntos de gasolina, servicios náuticos. Falta totalmente.
- **Sin capacidad de guardar waypoints propios**: los marcadores del mapa son fijos. Un usuario no puede añadir sus zonas de pesca favoritas.
- **Sub-tabs vigilancia y pesca**: los botones en el submenu redirigen a renderizadores ausentes (solo placeholder). Esos dos sub-tabs son feature gap crítico.

---

## 4. Comparativa

### Windy.com
- **Ventajas sobre este dashboard**: animaciones de partículas de viento en canvas, 50+ capas meteorológicas, pronóstico de oleaje con dirección y período en mapa, forecast por punto clickando en el mapa, interfaz de clase mundial.
- **Lo que este dashboard tiene que Windy no**: contexto local (mareas reales de Rota, Base Naval, AIS local), clasificación de amenaza, índice de pesca.

### MarineTraffic
- **Ventajas**: historial de trazas de buques (polyline), búsqueda por nombre/MMSI, información de ETA y destino, fotos de buques, notificaciones de entrada/salida de puerto.
- **Lo que falta aquí**: historial de posiciones, búsqueda de buques, alertas por buque específico.

### PredictWind
- **Ventajas**: routing meteorológico (optimiza ruta según viento/oleaje), múltiples modelos de pronóstico comparados (ECMWF vs GFS vs propietario), pronóstico por texto generado automáticamente, gráficos de tabla detallada con 10+ parámetros.
- **Lo que falta aquí**: routing, comparación de modelos, briefing textual, tablas detalladas.

### Navionics (Garmin)
- **Ventajas**: cartografía náutica oficial, batimetría, puntos de interés náutico (gasolineras, talleres, varaderos), planificación de ruta con calado.
- **Lo que falta aquí**: cartografía náutica (Mapbox dark no es carta náutica), batimetría, POIs náuticos.

---

## Prioridad de mejoras (siguiente iteración)

1. Sanitizar innerHTML con datos externos (seguridad crítica)
2. Implementar sub-tab **vigilancia** (clasificación amenaza ROZ, tracking multi-buque)
3. Implementar sub-tab **pesca** (índice condiciones, go/no-go, fase lunar, calendario especies)
4. Alerta barométrica visual prominente
5. Timestamp de última actualización en todos los widgets
6. Historial de posiciones AIS (últimas 10 posiciones por buque)
7. Animación de partículas de viento (canvas sobre mapa)
