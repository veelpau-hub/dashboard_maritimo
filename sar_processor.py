"""
SAR Sentinel-1 processor — Gyreo
===================================
Descarga el quicklook (preview JPEG ~500KB) del producto Sentinel-1 IW GRDH
más reciente sobre la bahía de Cádiz/Rota desde Copernicus Data Space.
No descarga el producto SAFE completo (~1GB) — inviable en Railway.

Variables de entorno necesarias:
  COPERNICUS_USER      — email de cuenta en dataspace.copernicus.eu
  COPERNICUS_PASSWORD  — contraseña
"""

import io
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image

log = logging.getLogger(__name__)

# ── Configuración ────────────────────────────────────────────────────────────
BBOX = [-6.8, 36.2, -5.8, 37.0]   # west, south, east, north — bahía de Cádiz/Rota

STATIC_DIR = Path(__file__).parent / 'static'
SAR_PNG    = STATIC_DIR / 'sar_latest.png'
SAR_META   = STATIC_DIR / 'sar_metadata.json'

TOKEN_URL  = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
SEARCH_URL = 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products'

# ── Auth ─────────────────────────────────────────────────────────────────────
def _get_token(user: str, password: str) -> str:
    r = requests.post(TOKEN_URL, data={
        'client_id':  'cdse-public',
        'username':   user,
        'password':   password,
        'grant_type': 'password',
    }, timeout=30)
    r.raise_for_status()
    return r.json()['access_token']

# ── Búsqueda ─────────────────────────────────────────────────────────────────
def _search_latest(token: str) -> dict | None:
    """Devuelve el producto Sentinel-1 IW GRDH más reciente sobre el BBOX."""
    w, s, e, n = BBOX
    wkt = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
    params = {
        '$filter': (
            "Collection/Name eq 'SENTINEL-1' and "
            f"OData.CSC.Intersects(area=geography'SRID=4326;{wkt}') and "
            "Attributes/OData.CSC.StringAttribute/any("
            "att:att/Name eq 'productType' and "
            "att/OData.CSC.StringAttribute/Value eq 'IW_GRDH_1S')"
        ),
        '$top': 1,
        '$orderby': 'ContentDate/Start desc',
    }
    r = requests.get(SEARCH_URL, params=params,
                     headers={'Authorization': f'Bearer {token}'}, timeout=30)
    r.raise_for_status()
    items = r.json().get('value', [])
    return items[0] if items else None

# ── Bounds desde footprint WKT ────────────────────────────────────────────────
def _bbox_from_wkt(wkt: str) -> list[float]:
    """Extrae [west, south, east, north] del WKT POLYGON en WGS84."""
    coords = re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)', wkt)
    lons = [float(c[0]) for c in coords]
    lats = [float(c[1]) for c in coords]
    return [min(lons), min(lats), max(lons), max(lats)]

# ── Descarga quicklook ────────────────────────────────────────────────────────
def _download_quicklook(token: str, product_id: str, product_name: str) -> bytes | None:
    """
    Descarga el quicklook/thumbnail del producto SAFE.
    Intenta la ruta estándar ESA: Products/{id}/Nodes/{name}/Nodes/preview/Nodes/quick-look.png
    Fallback: Products/{id}/Nodes/{name}/Nodes/preview/Nodes/map-overlay.kml (ignorado)
    """
    base = f'https://catalogue.dataspace.copernicus.eu/odata/v1/Products({product_id})'
    ql_path = (
        f"{base}/Nodes({product_name}.SAFE)"
        f"/Nodes(preview)/Nodes(quick-look.png)/$value"
    )
    try:
        r = requests.get(ql_path, headers={'Authorization': f'Bearer {token}'},
                         timeout=60, stream=True)
        if r.status_code == 200:
            buf = bytearray()
            for chunk in r.iter_content(chunk_size=65536):
                buf.extend(chunk)
                if len(buf) > 10 * 1024 * 1024:   # cap 10MB
                    break
            log.info(f'[SAR] Quicklook descargado: {len(buf)/1024:.0f}KB')
            return bytes(buf)
    except Exception as e:
        log.warning(f'[SAR] Quicklook path failed ({e}), trying assets...')

    # Fallback: listar Assets del producto
    try:
        r = requests.get(f'{base}/Assets',
                         headers={'Authorization': f'Bearer {token}'}, timeout=20)
        if r.status_code == 200:
            for asset in r.json().get('value', []):
                if 'QUICKLOOK' in asset.get('Type', '').upper():
                    aid = asset['Id']
                    r2 = requests.get(
                        f'https://catalogue.dataspace.copernicus.eu/odata/v1/Assets({aid})/$value',
                        headers={'Authorization': f'Bearer {token}'}, timeout=60,
                    )
                    if r2.status_code == 200:
                        log.info(f'[SAR] Quicklook via Assets: {len(r2.content)/1024:.0f}KB')
                        return r2.content
    except Exception as e:
        log.warning(f'[SAR] Assets fallback failed: {e}')

    return None

# ── Procesado de imagen ───────────────────────────────────────────────────────
def _process_quicklook(raw: bytes) -> Image.Image:
    """
    Convierte el quicklook JPEG a PNG RGBA:
    - Escala de grises (SAR no tiene color real)
    - Canal alpha: agua oscura → transparente, barcos/tierra → opaco
    """
    img = Image.open(io.BytesIO(raw)).convert('L')   # grayscale
    arr = np.array(img, dtype=np.float32)

    # Normalización por percentiles (robusta ante valores extremos)
    p2, p98 = np.percentile(arr, [2, 98])
    if p98 > p2:
        arr = np.clip((arr - p2) / (p98 - p2) * 255, 0, 255)
    arr = arr.astype(np.uint8)

    # Alpha: zonas muy oscuras (agua quieta) → más transparente
    # Zonas brillantes (barcos, rompeolas) → más opacas
    alpha = np.clip(arr.astype(np.float32) * 1.8, 60, 220).astype(np.uint8)

    rgba = np.stack([arr, arr, arr, alpha], axis=-1)
    return Image.fromarray(rgba, 'RGBA')

# ── Punto de entrada público ──────────────────────────────────────────────────
def run() -> dict | None:
    """
    Ejecuta el ciclo SAR completo.
    Devuelve el dict de metadatos si hubo actualización, None si no.
    """
    user     = os.getenv('COPERNICUS_USER', '')
    password = os.getenv('COPERNICUS_PASSWORD', '')

    if not user or not password:
        log.warning('[SAR] COPERNICUS_USER/PASSWORD no configurados — omitiendo')
        return None

    try:
        log.info('[SAR] Autenticando en Copernicus Data Space...')
        token = _get_token(user, password)

        log.info('[SAR] Buscando último producto Sentinel-1 sobre Cádiz...')
        product = _search_latest(token)
        if not product:
            log.info('[SAR] Sin productos disponibles en el área')
            return None

        product_id   = product['Id']
        product_name = product['Name']
        date_str     = product['ContentDate']['Start']
        footprint    = product.get('Footprint', '')

        log.info(f'[SAR] Producto encontrado: {product_name} ({date_str})')

        # Evitar reprocesar el mismo producto
        if SAR_META.exists():
            with open(SAR_META) as f:
                existing = json.load(f)
            if existing.get('product_id') == product_name:
                log.info('[SAR] Producto ya procesado, sin cambios')
                return None

        # Descargar quicklook
        raw = _download_quicklook(token, product_id, product_name)
        if not raw:
            log.error('[SAR] No se pudo descargar el quicklook')
            return None

        # Procesar imagen
        img = _process_quicklook(raw)

        # Obtener bounds del footprint (o usar bbox de búsqueda como fallback)
        bounds = _bbox_from_wkt(footprint) if footprint else BBOX
        # Recortar bounds al BBOX de interés si el producto cubre más área
        bounds = [
            max(bounds[0], BBOX[0] - 1.0),
            max(bounds[1], BBOX[1] - 1.0),
            min(bounds[2], BBOX[2] + 1.0),
            min(bounds[3], BBOX[3] + 1.0),
        ]

        # Guardar PNG
        STATIC_DIR.mkdir(exist_ok=True)
        img.save(str(SAR_PNG), 'PNG', optimize=True)

        meta = {
            'available':    True,
            'date':         date_str,
            'bounds':       bounds,       # [west, south, east, north]
            'product_id':   product_name,
            'processed_at': datetime.now(timezone.utc).isoformat(),
        }
        with open(SAR_META, 'w') as f:
            json.dump(meta, f, indent=2)

        log.info(f'[SAR] PNG guardado ({SAR_PNG.stat().st_size//1024}KB) — {date_str}')
        return meta

    except Exception as e:
        log.error(f'[SAR] Error en pipeline: {e}', exc_info=True)
        return None

def status() -> dict:
    """Devuelve estado actual del SAR (para /api/sar/status)."""
    if not SAR_META.exists():
        return {'available': False}
    try:
        with open(SAR_META) as f:
            meta = json.load(f)
        # Calcular antigüedad
        processed = datetime.fromisoformat(meta.get('processed_at', '2000-01-01T00:00:00+00:00'))
        age_hours = (datetime.now(timezone.utc) - processed).total_seconds() / 3600
        meta['age_hours'] = round(age_hours, 1)
        return meta
    except Exception:
        return {'available': False}
