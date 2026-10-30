#!/usr/bin/env python3
"""Regression checks for low-overhead rendering and camera scanning."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
html = (SITE / "index.html").read_text(encoding="utf-8")
css = (SITE / "styles.css").read_text(encoding="utf-8")
js = (SITE / "app.js").read_text(encoding="utf-8")
sw = (SITE / "sw.js").read_text(encoding="utf-8")

assert 'class="ambient' not in html and 'grid-overlay' not in html, "Heavy ambient overlays still present"
assert ".ambient,.grid-overlay{display:none!important}" in css, "Ambient overlays are not disabled"
assert "backdrop-filter:blur(" not in css, "Backdrop blur still present"
assert ".view{animation:none!important}" in css, "View transitions are not disabled"
assert "CAMERA_SCAN_INTERVAL_MS = 260" in js, "Camera scan interval missing"
assert "scannerTimer=window.setTimeout(scanCameraFrame,CAMERA_SCAN_INTERVAL_MS)" in js, "Camera scanner is not timer scheduled"
assert "requestAnimationFrame(scanCameraFrame)" not in js, "Camera scanner still runs an animation-frame loop"
assert "width:{ideal:960},height:{ideal:540},frameRate:{ideal:15,max:20}" in js, "Camera constraints are not optimized"
assert "qr-studio-static-v1.2.0" in sw, "Updated service worker cache version missing"
print("Performance smoke: static matte background, no blur/ambient animation, timer-based camera scan, reduced camera resolution and fresh cache passed.")
