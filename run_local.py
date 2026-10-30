#!/usr/bin/env python3
"""Start QR Studio locally for pre-publication testing (Python standard library only)."""
from __future__ import annotations

import argparse
import socket
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"
HOST = "127.0.0.1"  # Deliberately local-only; do not expose this test server to the LAN.
FIRST_PORT = 10000
LAST_PORT = 10099


class QuietHandler(SimpleHTTPRequestHandler):
    """Static site handler with concise logging."""

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[QR Studio] {self.address_string()} - {fmt % args}")


def create_server(port: int = 0) -> ThreadingHTTPServer:
    """Create server bound only to localhost. Port 0 is useful for smoke tests."""
    handler = partial(QuietHandler, directory=str(SITE))
    server = ThreadingHTTPServer((HOST, port), handler)
    server.daemon_threads = True
    return server


def choose_server(start_port: int = FIRST_PORT, end_port: int = LAST_PORT) -> ThreadingHTTPServer:
    """Try the preferred port, then fall back through 10000-10099 (never 8000)."""
    if not SITE.is_dir() or not (SITE / "index.html").is_file():
        raise FileNotFoundError(f"Cartella sito non trovata: {SITE}")
    last_error: OSError | None = None
    for port in range(start_port, end_port + 1):
        try:
            return create_server(port)
        except OSError as exc:
            last_error = exc
    raise OSError(f"Nessuna porta libera nell'intervallo {start_port}-{end_port}.") from last_error


def main() -> int:
    parser = argparse.ArgumentParser(description="Avvia QR Studio su localhost per provarlo prima della pubblicazione.")
    parser.add_argument("--no-browser", action="store_true", help="non aprire automaticamente il browser")
    args = parser.parse_args()
    try:
        server = choose_server()
    except (OSError, FileNotFoundError) as exc:
        print(f"ERRORE: {exc}", file=sys.stderr)
        return 1

    url = f"http://localhost:{server.server_address[1]}/"
    print("=" * 58)
    print(" QR STUDIO by FogLabs — test locale")
    print(f" URL: {url}")
    print(" Server accessibile solo da questo PC.")
    print(" Premi CTRL+C in questa finestra per chiudere.")
    print("=" * 58, flush=True)
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url, new=2)).start()
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print("\nChiusura QR Studio…")
    finally:
        server.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
