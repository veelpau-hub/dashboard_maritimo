import os
import logging
import requests

TELEGRAM_TOKEN   = os.getenv('TELEGRAM_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')

def send(message: str, silent: bool = False) -> bool:
    """Envía un mensaje al chat de Telegram configurado. Devuelve True si OK."""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        logging.warning('[telegram] TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados')
        return False
    try:
        r = requests.post(
            f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage',
            json={
                'chat_id': TELEGRAM_CHAT_ID,
                'text': message,
                'parse_mode': 'HTML',
                'disable_notification': silent,
            },
            timeout=8,
        )
        if r.status_code != 200:
            logging.error(f'[telegram] HTTP {r.status_code}: {r.text[:200]}')
        return r.status_code == 200
    except Exception as e:
        logging.error(f'[telegram] Error al enviar: {e}')
        return False
