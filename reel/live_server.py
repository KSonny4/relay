"""Serve the online presentation: the slides beside the live Relay web app.

    /           live.html   the slides and https://relay-web-s1d6.onrender.com side by side
    /deck.html  index.html  the offline slides, byte for byte

    python3 reel/live_server.py            # http://127.0.0.1:43126
"""

import base64
import http.server
import os


def load(env_key, filename):
    # On Render each page arrives base64-encoded in an env var and this file is exec'd without __file__.
    encoded = os.environ.get(env_key)
    if encoded:
        return base64.b64decode(encoded)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), filename), "rb") as f:
        return f.read()


PAGES = {
    "/": load("LIVE_HTML_B64", "live.html"),
    "/deck.html": load("DECK_HTML_B64", "index.html"),
}
PAGES["/index.html"] = PAGES["/"]
PAGES["/live.html"] = PAGES["/"]


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        page = PAGES.get(self.path.split("?", 1)[0])
        status, body, content_type = (
            (200, page, "text/html; charset=utf-8") if page is not None
            else (404, b"Not found", "text/plain; charset=utf-8")
        )
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    do_HEAD = do_GET


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "43126"))
    host = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"
    http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()
