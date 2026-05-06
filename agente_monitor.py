"""
Agente Monitor — comprueba la salud de las APIs y el estado interno cada CHECK_INTERVAL segundos.
Cuando detecta un fallo, llama a on_issue(service, detail) y envía alerta por Telegram.
Cuando un servicio se recupera, envía notificación de recuperación.
"""
import time
import logging
import threading
import requests
import os

import telegram_bot

CHECK_INTERVAL = int(os.getenv('MONITOR_INTERVAL', 300))   # segundos entre comprobaciones
TIMEOUT        = 8                                           # timeout por request de health-check

# Estado de alertas activas para evitar spam (service -> True si ya está alertado)
_alertas_activas: dict[str, bool] = {}
_lock = threading.Lock()

# ── Checks individuales ──────────────────────────────────────────────

def _check_open_meteo() -> tuple[bool, str]:
    try:
        r = requests.get(
            'https://api.open-meteo.com/v1/forecast',
            params={'latitude': 36.62, 'longitude': -6.35, 'current': 'temperature_2m'},
            timeout=TIMEOUT, verify=False,
        )
        if r.status_code == 200 and 'current' in r.json():
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)

def _check_marine_meteo() -> tuple[bool, str]:
    try:
        r = requests.get(
            'https://marine-api.open-meteo.com/v1/marine',
            params={'latitude': 36.62, 'longitude': -6.35, 'current': 'wave_height'},
            timeout=TIMEOUT, verify=False,
        )
        if r.status_code == 200 and 'current' in r.json():
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)

def _check_aemet(api_key: str) -> tuple[bool, str]:
    if not api_key:
        return True, 'sin_clave'   # no configurada — no es un fallo
    try:
        r = requests.get(
            'https://opendata.aemet.es/opendata/api/avisos_cap/ultimoelaborado/MARITIMAS/BAL',
            headers={'api_key': api_key},
            timeout=TIMEOUT, verify=False,
        )
        # 200 = ok, 404 = sin datos (no es error de API), 401 = clave inválida
        if r.status_code in (200, 404):
            return True, ''
        return False, f'HTTP {r.status_code}'
    except Exception as e:
        return False, str(e)

def _check_cache_freshness(get_cache_age_fn) -> tuple[bool, str]:
    """Considera fallo si la caché principal lleva más de 15 min sin actualizarse."""
    try:
        age = get_cache_age_fn()  # segundos desde la última actualización
        if age is None:
            return True, 'sin_datos_aún'
        if age > 900:  # 15 min
            return False, f'caché obsoleta: {int(age/60)} min sin actualizar'
        return True, ''
    except Exception as e:
        return False, str(e)

def _check_ais(is_ais_ok_fn) -> tuple[bool, str]:
    try:
        ok, detail = is_ais_ok_fn()
        return ok, detail
    except Exception as e:
        return False, str(e)

# ── Lógica de alerta / recuperación ─────────────────────────────────

def _emit(service: str, ok: bool, detail: str, on_issue_fn):
    with _lock:
        was_alertado = _alertas_activas.get(service, False)

    if not ok and not was_alertado:
        # Nueva alerta
        msg = (
            f'🔴 <b>Gyreo · Fallo detectado</b>\n'
            f'Servicio: <code>{service}</code>\n'
            f'Detalle: {detail}\n'
            f'⏱ {time.strftime("%H:%M:%S UTC", time.gmtime())}'
        )
        telegram_bot.send(msg)
        logging.error(f'[monitor] FALLO {service}: {detail}')
        with _lock:
            _alertas_activas[service] = True
        if on_issue_fn:
            on_issue_fn(service, detail)

    elif ok and was_alertado:
        # Recuperado
        msg = (
            f'🟢 <b>Gyreo · Servicio recuperado</b>\n'
            f'Servicio: <code>{service}</code>\n'
            f'⏱ {time.strftime("%H:%M:%S UTC", time.gmtime())}'
        )
        telegram_bot.send(msg)
        logging.info(f'[monitor] RECUPERADO {service}')
        with _lock:
            _alertas_activas[service] = False

# ── Bucle principal ──────────────────────────────────────────────────

def _run(aemet_key: str, get_cache_age_fn, is_ais_ok_fn, on_issue_fn):
    logging.info(f'[monitor] Iniciado · intervalo {CHECK_INTERVAL}s')
    # Primera comprobación con 30 s de retardo para dejar arrancar la app
    time.sleep(30)

    while True:
        logging.debug('[monitor] Ejecutando health checks...')

        checks = [
            ('open-meteo-forecast', _check_open_meteo()),
            ('open-meteo-marine',   _check_marine_meteo()),
            ('aemet',               _check_aemet(aemet_key)),
            ('cache-freshness',     _check_cache_freshness(get_cache_age_fn)),
            ('ais-stream',          _check_ais(is_ais_ok_fn)),
        ]

        for service, (ok, detail) in checks:
            _emit(service, ok, detail, on_issue_fn)

        time.sleep(CHECK_INTERVAL)

def start(aemet_key: str, get_cache_age_fn, is_ais_ok_fn, on_issue_fn=None):
    """
    Arranca el agente monitor en un hilo daemon.

    Parámetros:
      aemet_key        — AEMET_API_KEY para comprobar la API AEMET
      get_cache_age_fn — callable() → float (segundos desde última actualización de caché)
      is_ais_ok_fn     — callable() → (bool, str) (estado conexión AIS)
      on_issue_fn      — callable(service, detail) llamado cuando se detecta un nuevo fallo
    """
    t = threading.Thread(
        target=_run,
        args=(aemet_key, get_cache_age_fn, is_ais_ok_fn, on_issue_fn),
        daemon=True,
        name='agente-monitor',
    )
    t.start()
    return t
