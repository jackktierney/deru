#!/usr/bin/env python3
# Local preview only. The live site is plain static files served by GitHub Pages.
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

CHUNK_SIZE = 64 * 1024
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")

ROOT = os.path.dirname(os.path.abspath(__file__))
MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".ogg": "video/ogg",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_file(self, path):
        try:
            file_size = os.path.getsize(path)
        except OSError:
            self.send_response(404)
            self.end_headers()
            return

        ext = os.path.splitext(path)[1].lower()
        content_type = MIME_TYPES.get(ext, "application/octet-stream")

        start, end, status = 0, file_size - 1, 200
        match = RANGE_RE.match(self.headers.get("Range", ""))
        if match:
            start_str, end_str = match.groups()
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
            status = 206

        if start >= file_size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{file_size}")
            self.end_headers()
            return

        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.end_headers()

        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                remaining -= len(chunk)

    def do_GET(self):
        pathname = unquote(urlsplit(self.path).path)
        if pathname == "/":
            pathname = "/index.html"
        file_path = os.path.abspath(os.path.join(ROOT, pathname.lstrip("/")))
        if not file_path.startswith(ROOT):
            self.send_response(403)
            self.end_headers()
            return
        self._send_file(file_path)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Video gallery running at http://localhost:{port}")
    server.serve_forever()
