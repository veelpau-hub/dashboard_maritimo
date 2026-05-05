"""
Background WebSocket listener para aisstream.io.
Mantiene un cache en memoria de buques visibles en la zona.
"""
import json
import logging
import os
import threading
import time

import websocket

_vessels: dict = {}
_lock = threading.Lock()
_VESSEL_TTL = 600  # segundos sin actualización → se descarta
_last_message_ts: float = 0.0
_connected: bool = False

BOUNDING_BOX = [[[36.3, -7.0], [37.0, -5.8]]]
WS_URL = "wss://stream.aisstream.io/v0/stream"


def get_vessels() -> list[dict]:
    now = time.time()
    with _lock:
        return [v for v in _vessels.values() if now - v["_ts"] < _VESSEL_TTL]


def get_status() -> dict:
    """Returns AIS stream connection status."""
    global _last_message_ts, _connected
    age = time.time() - _last_message_ts if _last_message_ts else None
    return {
        'connected': _connected,
        'last_message_age_s': round(age, 0) if age is not None else None,
        'vessel_count': len(get_vessels()),
    }

def _on_open(ws):
    global _connected
    _connected = True
    api_key = os.getenv("AISSTREAM_API_KEY", "")
    ws.send(json.dumps({
        "APIKey": api_key,
        "BoundingBoxes": BOUNDING_BOX,
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
    }))
    logging.info("AISstream conectado")


def _on_message(ws, raw):
    global _last_message_ts
    _last_message_ts = time.time()
    try:
        data = json.loads(raw)
        msg_type = data.get("MessageType")
        meta = data.get("MetaData", {})
        mmsi = meta.get("MMSI")
        if not mmsi:
            return

        if msg_type == "PositionReport":
            pos = data.get("Message", {}).get("PositionReport", {})
            with _lock:
                existing = _vessels.get(mmsi, {})
                _vessels[mmsi] = {
                    "mmsi":        mmsi,
                    "name":        meta.get("ShipName", "Desconocido").strip(),
                    "lat":         meta.get("Latitude"),
                    "lon":         meta.get("Longitude"),
                    "speed":       pos.get("Sog"),
                    "course":      pos.get("Cog"),
                    "nav_status":  pos.get("NavigationalStatus"),
                    "type":        existing.get("type"),
                    "destination": existing.get("destination"),
                    "_ts":         time.time(),
                }
        elif msg_type == "ShipStaticData":
            static = data.get("Message", {}).get("ShipStaticData", {})
            with _lock:
                existing = _vessels.get(mmsi, {"mmsi": mmsi, "_ts": time.time()})
                existing.update({
                    "type":        static.get("Type"),
                    "destination": (static.get("Destination") or "").strip() or None,
                    "eta":         static.get("Eta"),
                    "draught":     static.get("MaximumStaticDraught"),
                    "callsign":    static.get("CallSign", "").strip() or None,
                })
                _vessels[mmsi] = existing
    except Exception as e:
        logging.warning(f"AIS parse error: {e}")


def _on_error(ws, error):
    logging.warning(f"AISstream error: {error}")


def _on_close(ws, code, msg):
    global _connected
    _connected = False
    logging.info(f"AISstream cerrado ({code})")


def _run():
    while True:
        try:
            ws = websocket.WebSocketApp(
                WS_URL,
                on_open=_on_open,
                on_message=_on_message,
                on_error=_on_error,
                on_close=_on_close,
            )
            ws.run_forever(ping_interval=30, ping_timeout=10)
        except Exception as e:
            logging.warning(f"AISstream caído, reconectando: {e}")
        time.sleep(10)


def start():
    t = threading.Thread(target=_run, daemon=True, name="ais-stream")
    t.start()
    logging.info("AIS background thread iniciado")
