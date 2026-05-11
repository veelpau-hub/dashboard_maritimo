"""
SAR Sentinel-1 processor — Gyreo
===================================
Descarga el quicklook (preview JPEG ~500KB) del producto Sentinel-1 IW GRDH
más reciente sobre la bahía de Cádiz/Rota desde Copernicus Data Space.

Variables de entorno:
  COPERNICUS_USER      — email de cuenta en dataspace.copernicus.eu
  COPERNICUS_PASSWORD  — contraseña

Dependencias: numpy, Pillow, requests  (ya en requirements.txt)
"""

import io
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import requests
from PIL import Image

log = logging.getLogger(__name__)

# ── Configuración ────────────────────────────────────────────────────────────
BBOX = [-6.8, 36.2, -5.8, 37.0]   # [west, south, east, north] — bahía de Cádiz/Rota

STATIC_DIR = Path(__file__).parent / 'static'
SAR_PNG    = STATIC_DIR / 'sar_latest.png'
SAR_META   = STATIC_DIR / 'sar_metadata.json'

TOKEN_URL  = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
SEARCH_URL = 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products'
ZIPPER_URL = 'https://zipper.dataspace.copernicus.eu/odata/v1'

SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'Gyreo/1.0'})

# ── Auth ─────────────────────────────────────────────────────────────────────
def _get_token(user: str, password: str) -> str:
    r = SESSION.post(TOKEN_URL, data={
        'client_id':  'cdse-public',
        'username':   user,
        'password':   password,
        'grant_type': 'password',
    }, timeout=30)
    r.raise_for_status()
    token = r.json().get('access_token')
    if not token:
        raise RuntimeError(f'Token vacío. Respuesta: {r.text[:200]}')
    return token

# ── Búsqueda ─────────────────────────────────────────────────────────────────
def _search_latest(token: str) -> Optional[dict]:
    """
    Busca el producto Sentinel-1 GRD más reciente sobre el BBOX.
    Usa contains(Name,'GRD') en lugar del filtro de Attributes, que es más
    robusto frente a cambios en el esquema OData de CDSE.
    """
    w, s, e, n = BBOX
    wkt = f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
    params = {
        '$filter': (
            "Collection/Name eq 'SENTINEL-1' and "
            f"OData.CSC.Intersects(area=geography'SRID=4326;{wkt}') and "
            "contains(Name,'GRD')"
        ),
        '$top':     3,
        '$orderby': 'ContentDate/Start desc',
    }
    r = SESSION.get(
        SEARCH_URL, params=params,
        headers={'Authorization': f'Bearer {token}'},
        timeout=30,
    )
    r.raise_for_status()
    data  = r.json()
    items = data.get('value', [])
    log.info(f'[SAR] Búsqueda devolvió {len(items)} productos')
    return items[0] if items else None

# ── Quicklook ─────────────────────────────────────────────────────────────────
def _download_quicklook(token: str, product_id: str, product_name: str) -> Optional[bytes]:
    """
    Descarga el quicklook del producto SAFE a través del zipper de CDSE.
    Rutas intentadas (de más a menos probable):
      1. zipper /Products/{id}/Nodes/{name}.SAFE/Nodes(preview)/Nodes(quick-look.png)/$value
      2. catalogue /Products/{id}/Assets  → primer asset tipo QUICKLOOK
    """
    headers = {'Authorization': f'Bearer {token}'}

    # ── Intento 1: ruta directa zipper ──
    ql = (
        f"{ZIPPER_URL}/Products({product_id})"
        f"/Nodes({product_name}.SAFE)"
        f"/Nodes(preview)/Nodes(quick-look.png)/$value"
    )
    try:
        r = SESSION.get(ql, headers=headers, timeout=90, stream=True)
        if r.status_code == 200:
            buf = b''.join(r.iter_content(chunk_size=65536))
            if len(buf) > 1000:
                log.info(f'[SAR] Quicklook via zipper: {len(buf)//1024}KB')
                return buf
        log.warning(f'[SAR] Zipper returned HTTP {r.status_code}')
    except Exception as e:
        log.warning(f'[SAR] Zipper falló: {e}')

    # ── Intento 2: Assets API (catalogue) ──
    try:
        r = SESSION.get(
            f'https://catalogue.dataspace.copernicus.eu/odata/v1/Products({product_id})/Assets',
            headers=headers, timeout=20,
        )
        if r.status_code == 200:
            for asset in r.json().get('value', []):
                if 'QUICKLOOK' in asset.get('Type', '').upper():
                    aid = asset['Id']
                    r2 = SESSION.get(
                        f'https://catalogue.dataspace.copernicus.eu/odata/v1/Assets({aid})/$value',
                        headers=headers, timeout=90,
                    )
                    if r2.status_code == 200 and len(r2.content) > 1000:
                        log.info(f'[SAR] Quicklook via Assets: {len(r2.content)//1024}KB')
                        return r2.content
    except Exception as e:
        log.warning(f'[SAR] Assets fallback falló: {e}')

    return None

# ── Procesado ─────────────────────────────────────────────────────────────────
def _process_quicklook(raw: bytes) -> Image.Image:
    """
    Convierte quicklook JPEG → PNG RGBA.
    Normalización por percentiles; agua oscura → transparente.
    """
    img = Image.open(io.BytesIO(raw)).convert('L')
    arr = np.array(img, dtype=np.float32)

    p2, p98 = np.percentile(arr, [2, 98])
    if p98 > p2:
        arr = np.clip((arr - p2) / (p98 - p2) * 255, 0, 255)
    arr = arr.astype(np.uint8)

    alpha = np.clip(arr.astype(np.float32) * 1.8, 60, 220).astype(np.uint8)
    rgba  = np.stack([arr, arr, arr, alpha], axis=-1)
    return Image.fromarray(rgba, 'RGBA')

# ── Footprint → bounds ────────────────────────────────────────────────────────
def _bbox_from_wkt(wkt: str) -> list:
    coords = re.findall(r'(-?\d+\.?\d*)\s+(-?\d+\.?\d*)', wkt)
    lons   = [float(c[0]) for c in coords]
    lats   = [float(c[1]) for c in coords]
    return [min(lons), min(lats), max(lons), max(lats)]

# ── API pública ───────────────────────────────────────────────────────────────
def run() -> Optional[dict]:
    """
    Ejecuta el ciclo SAR completo.
    Devuelve metadatos si procesó una imagen nueva, None en caso contrario.
    Propaga excepciones para que la ruta /api/sar/refresh las capture y loggee.
    """
    user     = os.getenv('COPERNICUS_USER', '').strip()
    password = os.getenv('COPERNICUS_PASSWORD', '').strip()

    if not user or not password:
        log.warning('[SAR] COPERNICUS_USER/PASSWORD no configurados')
        raise RuntimeError('Credenciales de Copernicus no configuradas')

    log.info(f'[SAR] Autenticando como {user[:4]}...')
    token = _get_token(user, password)
    log.info('[SAR] Token OK — buscando producto más reciente...')

    product = _search_latest(token)
    if not product:
        log.info('[SAR] No hay productos GRD en el área')
        return None

    product_id   = product['Id']
    product_name = product['Name']
    date_str     = product['ContentDate']['Start']
    footprint    = product.get('Footprint', '')

    log.info(f'[SAR] Encontrado: {product_name}  ({date_str})')

    # Evitar reprocesar el mismo producto
    if SAR_META.exists():
        with open(SAR_META) as f:
            existing = json.load(f)
        if existing.get('product_id') == product_name:
            log.info('[SAR] Producto ya procesado — sin cambios')
            return None

    raw = _download_quicklook(token, product_id, product_name)
    if not raw:
        raise RuntimeError('Quicklook no disponible para este producto')

    img = _process_quicklook(raw)

    bounds = _bbox_from_wkt(footprint) if footprint else BBOX

    STATIC_DIR.mkdir(exist_ok=True)
    img.save(str(SAR_PNG), 'PNG', optimize=True)

    meta = {
        'available':    True,
        'date':         date_str,
        'bounds':       bounds,
        'product_id':   product_name,
        'processed_at': datetime.now(timezone.utc).isoformat(),
    }
    with open(SAR_META, 'w') as f:
        json.dump(meta, f, indent=2)

    log.info(f'[SAR] Guardado {SAR_PNG.stat().st_size//1024}KB — {date_str}')
    return meta


def status() -> dict:
    """Estado actual (para GET /api/sar/status)."""
    if not SAR_META.exists():
        return {'available': False}
    try:
        with open(SAR_META) as f:
            meta = json.load(f)
        processed = datetime.fromisoformat(meta.get('processed_at', '2000-01-01T00:00:00+00:00'))
        meta['age_hours'] = round(
            (datetime.now(timezone.utc) - processed).total_seconds() / 3600, 1
        )
        return meta
    except Exception:
        return {'available': False}
