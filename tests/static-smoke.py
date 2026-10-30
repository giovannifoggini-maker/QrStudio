from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
site = root / 'site'
required = [
    'index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.webmanifest',
    'lib/qr-engine.js', 'assets/favicon.svg', 'assets/icon-192.png',
    'assets/icon-512.png', 'assets/qr-studio-logo.png', 'assets/qr-studio-symbol.png', 'assets/qr-studio-test.png', '_headers'
]
for rel in required:
    path = site / rel
    assert path.is_file() and path.stat().st_size > 0, f'Missing or empty asset: {rel}'

html = (site / 'index.html').read_text(encoding='utf-8')
for attr in re.findall(r'(?:src|href)=[\"\']([^\"\']+)', html):
    if attr.startswith(('http:', 'https:', 'data:', '#', 'mailto:', 'tel:')):
        continue
    if attr.startswith('./'):
        attr = attr[2:]
    if attr and not (site / attr).exists():
        raise AssertionError(f'Unresolved local asset: {attr}')

# QR decoding fallback is loaded on demand from a fixed-version public distribution. HTML shell remains local.
remote_script_or_style = re.search(
    r'<script[^>]+src=[\"\']https?://|<link[^>]+href=[\"\']https?://', html, re.I
)
assert not remote_script_or_style, 'HTML statically loads remote JS/CSS'
app = (site / 'app.js').read_text(encoding='utf-8')
assert not re.search(r'\bfetch\s*\(|XMLHttpRequest|new WebSocket\s*\(', app), 'App unexpectedly uploads data or opens a network API connection'
assert 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js' in app and 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js' in app, 'Pinned JSQR fallback URLs missing'
assert 'ensureJsQR' in app and app.index('function ensureJsQR') > app.index('const JSQR_CANDIDATES'), 'On-demand decoder loader missing'
assert (root / '.github/workflows/deploy-pages.yml').is_file()
assert (root / '_headers').is_file()
print(f'Static smoke: {len(required)} assets and local references OK; fallback decoder is version-pinned and loaded only on scan request; no QR payload upload API.')
