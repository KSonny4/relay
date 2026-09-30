"""Serve one Relay presentation and keep its deck and phone page on the same slide.

Offline (relay-reel):     /  index.html      /control  control.html
Online (relay-reel-live): /  live.html       /deck.html  index.html      /control  control.html

/mode.js tells the deck and the phone page which site they are on; the online deck adds one intro slide.

The current slide lives in this process, so each site's phone page moves only that site's deck:
    GET  /api/slide         {"slide": 3, "seq": 12, "stop": 0}
    POST /api/slide         {"slide": 4}  -> the new state
    POST /api/stop-recording              -> {"stop": 1} and the deck posts it to the live app
    GET  /api/slide/events  server-sent events, one state per change

    python3 reel/server.py            # offline, http://127.0.0.1:43125
    python3 reel/server.py online     # online,  http://127.0.0.1:43126
"""

import base64
import io
import json
import os
import sys
import threading
import zipfile
import http.server

MODE = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DECK_MODE", "offline")).strip()
FILES = ("index.html", "live.html", "control.html", "slides.js", "sync.js")
MAX_SLIDE = 50
HEARTBEAT_SECONDS = 15


def load_files():
    # On Render the files arrive as a base64 zip in REEL_ZIP_B64 and this file is exec'd without __file__.
    encoded = os.environ.get("REEL_ZIP_B64")
    if encoded:
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded))) as z:
            return {name: z.read(name) for name in FILES}
    here = os.path.dirname(os.path.abspath(__file__))
    out = {}
    for name in FILES:
        with open(os.path.join(here, name), "rb") as f:
            out[name] = f.read()
    return out


CONTENT = load_files()
CONTENT["mode.js"] = ("window.RELAY_MODE = %s;\n" % json.dumps(MODE)).encode()
ROUTES = {
    "/": "live.html" if MODE == "online" else "index.html",
    "/index.html": "live.html" if MODE == "online" else "index.html",
    "/control": "control.html",
    "/control/": "control.html",
    "/control.html": "control.html",
    "/slides.js": "slides.js",
    "/sync.js": "sync.js",
    "/mode.js": "mode.js",
}
if MODE == "online":
    ROUTES["/deck.html"] = "index.html"
    ROUTES["/live.html"] = "live.html"

# `stop` counts Stop recording presses. It is not replayed to a deck that connects later.
state = {"slide": 1, "seq": 0, "stop": 0}
changed = threading.Condition()


def snapshot():
    with changed:
        return dict(state)


def set_slide(slide):
    with changed:
        if slide != state["slide"]:
            state["slide"] = slide
            state["seq"] += 1
            changed.notify_all()
        return dict(state)


def request_stop():
    with changed:
        state["stop"] += 1
        changed.notify_all()
        return dict(state)


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def reply(self, status, body, content_type):
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def reply_json(self, status, obj):
        self.reply(status, json.dumps(obj).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/slide":
            self.reply_json(200, snapshot())
        elif path == "/api/slide/events":
            self.stream()
        elif path in ROUTES:
            name = ROUTES[path]
            kind = "text/javascript" if name.endswith(".js") else "text/html"
            self.reply(200, CONTENT[name], kind + "; charset=utf-8")
        else:
            self.reply(404, b"Not found", "text/plain; charset=utf-8")

    do_HEAD = do_GET

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/stop-recording":
            length = int(self.headers.get("content-length") or 0)
            if length:
                self.rfile.read(min(length, 1024))
            self.reply_json(200, request_stop())
            return
        if path != "/api/slide":
            self.reply_json(404, {"error": "Not found"})
            return
        length = int(self.headers.get("content-length") or 0)
        try:
            slide = json.loads(self.rfile.read(min(length, 1024)) or b"{}").get("slide")
        except (ValueError, AttributeError):
            slide = None
        if not isinstance(slide, int) or isinstance(slide, bool) or not 1 <= slide <= MAX_SLIDE:
            self.reply_json(400, {"error": "slide must be an integer from 1 to %d" % MAX_SLIDE})
            return
        self.reply_json(200, set_slide(slide))

    def stream(self):
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-store")
        self.send_header("x-accel-buffering", "no")
        self.send_header("connection", "keep-alive")
        self.end_headers()
        self.close_connection = True
        try:
            current = snapshot()
            self.wfile.write(b"retry: 2000\n\ndata: " + json.dumps(current).encode() + b"\n\n")
            self.wfile.flush()
            seen = current["seq"]
            while True:
                with changed:
                    changed.wait_for(lambda: state["seq"] != seen, timeout=HEARTBEAT_SECONDS)
                    current = dict(state)
                if current["seq"] != seen:
                    seen = current["seq"]
                    self.wfile.write(b"data: " + json.dumps(current).encode() + b"\n\n")
                else:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    default_port = "43126" if MODE == "online" else "43125"
    port = int(os.environ.get("PORT", default_port))
    host = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"
    Server((host, port), Handler).serve_forever()
