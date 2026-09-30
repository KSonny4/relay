"""Serve the online presentation and forward its API calls to relay-server.

relay-server only answers browsers on its own allowlist of origins, so the page
calls /api/* on this same origin and this server forwards those calls. Only the
three routes the page uses are forwarded; /api/deepgram/token is not.

    python3 reel/live_server.py            # http://127.0.0.1:43126
"""

import base64
import http.server
import os
import urllib.error
import urllib.request

RELAY_API = os.environ.get("RELAY_API", "https://relay-server-9hzn.onrender.com").rstrip("/")
FORWARD = {"/api/transcribe", "/api/classify", "/api/sessions"}
MAX_BODY = 40 * 1024 * 1024


def load_page():
    # On Render the page arrives base64-encoded in LIVE_HTML_B64 and this file is exec'd without __file__.
    encoded = os.environ.get("LIVE_HTML_B64")
    if encoded:
        return base64.b64decode(encoded)
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "live.html"), "rb") as f:
        return f.read()


PAGE = load_page()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def reply(self, status, body, content_type):
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def error_json(self, status, message):
        self.reply(status, ('{"error":"%s"}' % message).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html", "/live.html"):
            self.reply(200, PAGE, "text/html; charset=utf-8")
        else:
            self.error_json(404, "Not found")

    do_HEAD = do_GET

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path not in FORWARD:
            self.error_json(404, "Not found")
            return
        length = int(self.headers.get("content-length") or 0)
        if length > MAX_BODY:
            self.error_json(413, "Payload too large")
            return
        body = self.rfile.read(length)
        request = urllib.request.Request(
            RELAY_API + path,
            data=body,
            method="POST",
            headers={"content-type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as res:
                status, data = res.status, res.read()
                content_type = res.headers.get("content-type", "application/json")
        except urllib.error.HTTPError as err:
            status, data = err.code, err.read()
            content_type = err.headers.get("content-type", "application/json")
        except (urllib.error.URLError, TimeoutError):
            self.error_json(502, "relay-server did not answer")
            return
        self.reply(status, data, content_type)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "43126"))
    host = "0.0.0.0" if "PORT" in os.environ else "127.0.0.1"
    http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()
