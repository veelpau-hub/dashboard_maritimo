# Dashboard Marítimo — Diseño

**Fecha:** 2026-04-28
**Proyecto:** dashboard-maritimo (Railway)
**URL producción:** https://dashboard-maritimo.up.railway.app

---

## Contexto y objetivo

Dashboard marítimo público y gratuito centrado en la Base Naval de Rota (36.6367°N, 6.3493°W). Usuarios civiles y militares. Sin login. Sostenible mediante donaciones y publicidad discreta. Coste de mantenimiento objetivo: €5-10/mes.

---

## Arquitectura

**Stack actual (se mantiene):**
- Backend: Flask (Python 3), Railway
- Frontend: HTML/CSS/JS vanilla + D3.js + Mapbox GL
- Persistencia: SQLite (`preferencias.db`) para preferencias de widgets
- APIs de datos: todas gratuitas (ver tabla sub-tabs)

**Bugs a corregir antes de todo lo demás:**
- `app.py` tiene la ruta `'/'` duplicada — Flask usa la primera, que no pasa `mapbox_key`. Eliminar el bloque duplicado.
- `init_db()` solo se llama en `__main__` — añadir llamada al inicio del módulo para Gunicorn.

---

## Diseño visual

**Paleta:**
- Fondo body: `#0a0f1e`
- Fondo cards: `#0d1520` con borde `rgba(255,255,255,0.07)`
- Acento principal: `#4AC8E8`
- Acento alerta: `#f59e0b`
- Acento peligro: `#ef4444`
- Texto principal: `rgba(255,255,255,0.9)`
- Texto secundario: `rgba(255,255,255,0.4)`

**Cambios CSS:**
- Eliminar `backdrop-filter: blur()` de cards y sidebar — reemplazar por fondo sólido `#0d1520`
- Eliminar `background: url('/static/bg.png')` del body — fondo sólido `#0a0f1e`
- Mantener border-radius, transiciones y widgets D3.js existentes
- Cards con `border: 1px solid rgba(255,255,255,0.07)` en lugar de glassmorphism

---

## Tab 1 — Overview (Home)

Estado actual: funcional. Cambios mínimos:
- CSS renovado (ver arriba)
- Banner Ko-fi: 1 línea discreta arriba a la derecha (`position: fixed`, `top: 12px`, `right: 16px`)
- Grid de widgets editables se mantiene

---

## Tab 2 — Dashboard (7 sub-tabs)

La sidebar secundaria muestra 7 botones con icono + etiqueta. Al pulsar cada uno se carga el contenido vía fetch en el panel principal.

| Sub-tab | Icono | API | Datos mostrados |
|---|---|---|---|
| Meteorología | 🌦 | Open-Meteo forecast (gratis) | Gráficos 7 días: temperatura, viento, lluvia, presión |
| Oleaje | 🌊 | Open-Meteo Marine (gratis) | Altura, período, dirección, temp. agua, BFT histórico |
| Mareas | 🌓 | IHM / Puertos del Estado XML (gratis) | Curva del día, pleamares/bajamares, calendario mensual |
| AIS | 🚢 | AISHub (gratis, ~5min retraso) | Buques en área Rota: nombre, tipo, rumbo, velocidad |
| Alertas | ⚠️ | AEMET CAP XML (gratis) | Avisos activos provincia Cádiz, nivel de alerta |
| Predicción 7d | 📅 | Open-Meteo (gratis) | Vista semanal: icono tiempo, viento, olas, temp |
| Calidad aire | 💨 | Open-Meteo Air Quality (gratis) | UV, PM2.5, PM10, O₃, índice AQI |

**Implementación:**
- Endpoint Flask `/api/dashboard/<tab>` por cada sub-tab, devuelve JSON
- Frontend carga contenido vía fetch al cambiar sub-tab
- Cache 10 minutos por tab en memoria del servidor
- Sub-tab activo resaltado en sidebar secundaria

---

## Tab 3 — Mapa

- Mapbox GL JS (free tier: 50k cargas/mes)
- Capas toggleables desde panel superpuesto:
  - Buques AIS (puntos con popup: nombre, tipo, velocidad, rumbo)
  - Alertas activas (polígonos coloreados por nivel)
  - Waypoints de interés (Base Naval, Puerto de Rota)
- Marcador NAVSTA Rota existente se mantiene
- Controles: zoom, rotación, toggle estilo dark/satélite

---

## Tab 4 — Ajustes

- Unidades temperatura: °C / °F
- Unidades viento: km/h / kt / m/s
- Widgets visibles en Overview (ya existe)
- Idioma: ES / EN (strings en objeto JS, sin librería i18n)
- Sección "Acerca de": versión, créditos APIs, enlace donación

---

## Publicidad

| Slot | Posición | Tamaño | Condición |
|---|---|---|---|
| Banner inferior | Pie del panel principal | 728×90 | Visible salvo tab Mapa |
| Lateral derecho | Columna fija derecha | 160×600 | Solo pantallas >1400px |

- Sin publicidad en tab Mapa
- Sin publicidad en mobile (<768px)
- Etiqueta "Publicidad" encima de cada slot
- Espacio reservado en CSS aunque AdSense no cargue (sin layout shift)

---

## Monetización proyectada

| Fuente | 5k visitas/mes | 20k visitas/mes |
|---|---|---|
| Google AdSense | €10-30 | €60-150 |
| Sponsor náutico directo | €50-150 | €100-300 |
| Donaciones Ko-fi | €10-40 | €30-80 |
| **Total** | **€70-220** | **€190-530** |

Coste fijo: €5-10/mes. Rentable a partir de ~3k visitas/mes con sponsors.

---

## Orden de implementación

1. Corregir bugs: ruta duplicada + `init_db()` en Gunicorn
2. Rediseño CSS: fondo sólido, eliminar glassmorphism
3. Tab 2: sidebar secundaria funcional + 7 sub-tabs con datos reales
4. Tab 4: ajustes (unidades, idioma)
5. Tab 3: mapa con capas AIS y alertas toggleables
6. Slots de publicidad en layout
7. Banner Ko-fi en Overview
