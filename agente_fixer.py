"""
Agente Fixer — intenta recuperar automáticamente servicios que el monitor ha marcado como caídos.
Recibe callbacks para ejecutar acciones de recuperación sin importar app.py (evita imports circulares).
"""
import time
import logging
import threading

import telegram_bot

# Tiempo mínimo entre intentos de fix del mismo servicio (segundos)
FIX_COOLDOWN = 120

_ultimo_fix: dict[str, float] = {}
_lock = threading.Lock()

# ── Acciones de recuperación por servicio ────────────────────────────

def _fix_open_meteo(clear_cache_fn):
    """Fuerza invalidación de caché para que la próxima petición refresque los datos."""
    logging.info('[fixer] open-meteo: invalidando caché...')
    clear_cache_fn()
    time.sleep(3)
    return True, 'Caché invalidada · el próximo request refrescará los datos'

def _fix_marine_meteo(clear_cache_fn):
    logging.info('[fixer] open-meteo-marine: invalidando caché...')
    clear_cache_fn()
    return True, 'Caché invalidada'

def _fix_aemet(_clear_cache_fn):
    # AEMET es un servicio externo — solo podemos informar, no reparar
    return False, 'Servicio externo — sin acción automática posible'

def _fix_cache_freshness(clear_cache_fn):
    logging.info('[fixer] cache-freshness: forzando refresco...')
    clear_cache_fn()
    return True, 'Caché forzada · los datos se refrescarán en el próximo ciclo'

def _fix_ais(restart_ais_fn):
    logging.info('[fixer] ais-stream: intentando reconexión...')
    try:
        restart_ais_fn()
        time.sleep(5)
        return True, 'Reconexión AIS solicitada'
    except Exception as e:
        return False, f'Error al reconectar AIS: {e}'

_fix_actions = {
    'open-meteo-forecast': _fix_open_meteo,
    'open-meteo-marine':   _fix_marine_meteo,
    'aemet':               _fix_aemet,
    'cache-freshness':     _fix_cache_freshness,
    'ais-stream':          _fix_ais,
}

# ── Dispatcher principal ─────────────────────────────────────────────

def fix(service: str, detail: str, clear_cache_fn, restart_ais_fn):
    """
    Intenta reparar el servicio indicado.
    Respeta un cooldown por servicio para evitar loops de fix.
    """
    now = time.time()
    with _lock:
        last = _ultimo_fix.get(service, 0)
        if now - last < FIX_COOLDOWN:
            logging.debug(f'[fixer] {service}: en cooldown, omitiendo')
            return
        _ultimo_fix[service] = now

    action = _fix_actions.get(service)
    if not action:
        logging.warning(f'[fixer] Sin acción definida para {service}')
        return

    # Seleccionar el argumento correcto según el servicio
    if service == 'ais-stream':
        arg = restart_ais_fn
    else:
        arg = clear_cache_fn

    telegram_bot.send(
        f'🔧 <b>Gyreo · Intentando reparar</b>\n'
        f'Servicio: <code>{service}</code>\n'
        f'⏱ {time.strftime("%H:%M:%S UTC", time.gmtime())}',
        silent=True,
    )

    try:
        ok, msg = action(arg)
        status = '✅ Reparado' if ok else '❌ Sin solución automática'
        telegram_bot.send(
            f'{status}\n'
            f'Servicio: <code>{service}</code>\n'
            f'Resultado: {msg}\n'
            f'⏱ {time.strftime("%H:%M:%S UTC", time.gmtime())}',
            silent=(not ok),
        )
        logging.info(f'[fixer] {service}: {status} — {msg}')
    except Exception as e:
        logging.error(f'[fixer] Error ejecutando fix para {service}: {e}')
        telegram_bot.send(
            f'❌ <b>Gyreo · Error en fixer</b>\n'
            f'Servicio: <code>{service}</code>\n'
            f'Error: {e}',
        )

def make_issue_handler(clear_cache_fn, restart_ais_fn):
    """
    Devuelve un callable on_issue(service, detail) para pasar al agente monitor.
    Ejecuta el fix en un hilo separado para no bloquear el monitor.
    """
    def on_issue(service: str, detail: str):
        threading.Thread(
            target=fix,
            args=(service, detail, clear_cache_fn, restart_ais_fn),
            daemon=True,
            name=f'fixer-{service}',
        ).start()
    return on_issue
