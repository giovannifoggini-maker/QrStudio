#!/usr/bin/env python3
"""End-to-end smoke test for the included localhost server."""
import socket
import threading
import urllib.request
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
import run_local  # noqa: E402

# Verify automatic fallback without relying on a hard-coded port being free.
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
    occupied.bind((run_local.HOST, 0))
    occupied.listen(1)
    reserved_port = occupied.getsockname()[1]
    fallback = run_local.choose_server(reserved_port, reserved_port + 1)
    assert fallback.server_address[1] == reserved_port + 1, "Server did not fall back after an occupied port"
    assert fallback.server_address[0] == run_local.HOST, "Server must bind to localhost only"
    fallback.server_close()

server = run_local.create_server(0)
thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
thread.start()
base = f"http://127.0.0.1:{server.server_address[1]}"
try:
    checks = {
        "/": ("text/html", b"QR STUDIO"),
        "/index.html": ("text/html", b"QR STUDIO"),
        "/styles.css": ("text/css", b"--mint"),
        "/app.js": ("javascript", b"function refreshGenerate"),
        "/lib/qr-engine.js": ("javascript", b"FogQR"),
        "/manifest.webmanifest": ("application/manifest+json", b"QR Studio"),
        "/assets/icon-192.png": ("image/png", b"\x89PNG\r\n\x1a\n"),
        "/assets/qr-studio-test.png": ("image/png", b"\x89PNG\r\n\x1a\n"),
    }
    for path, (expected_type, expected_body) in checks.items():
        with urllib.request.urlopen(base + path, timeout=3) as response:
            body = response.read()
            content_type = response.headers.get("Content-Type", "")
            assert response.status == 200, f"{path}: HTTP {response.status}"
            assert expected_type in content_type, f"{path}: unexpected content type {content_type!r}"
            assert expected_body in body, f"{path}: expected marker missing"
    print(f"Local server smoke: {len(checks)} HTTP routes passed; port fallback and localhost-only binding passed.")
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)
