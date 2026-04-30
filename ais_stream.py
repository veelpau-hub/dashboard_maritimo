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

BOUNDING_BOX = [[[36.3, -7.0], [37.0, -5.8]]]
WS_URL = "wss://stream.aisstream.io/v0/stream"


def get_vessels() -> list[dict]:
    now = time.time()
    with _lock:
        return [v for v in _vessels.values() if now - v["_ts"] < _VESSEL_TTL]


def _on_open(ws):
    api_key = os.getenv("AISSTREAM_API_KEY", "")
    ws.send(json.dumps({
        "APIKey": api_key,
        "BoundingBoxes": BOUNDING_BOX,
        "FilterMessageTypes": ["PositionReport"],
    }))
    logging.info("AISstream conectado")


def _on_message(ws, raw):
    try:
        data = json.loads(raw)
        if data.get("MessageType") != "PositionReport":
            return
        meta = data.get("MetaData", {})
        pos  = data.get("Message", {}).get("PositionReport", {})
        mmsi = meta.get("MMSI")
        if not mmsi:
            return
        with _lock:
            _vessels[mmsi] = {
                "mmsi":   mmsi,
                "name":   meta.get("ShipName", "Desconocido").strip(),
                "lat":    meta.get("Latitude"),
                "lon":    meta.get("Longitude"),
                "speed":  pos.get("Sog"),
                "course": pos.get("Cog"),
                "_ts":    time.time(),
            }
    except Exception as e:
        logging.warning(f"AIS parse error: {e}")


def _on_error(ws, error):
    logging.warning(f"AISstream error: {error}")


def _on_close(ws, code, msg):
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
