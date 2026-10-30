#!/usr/bin/env python3
"""Static integration checks for QR Studio scanner, test QR and project import/export."""
from html.parser import HTMLParser
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'

class IdParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=set()
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == 'id' and value: self.ids.add(value)

html=(SITE/'index.html').read_text(encoding='utf-8')
js=(SITE/'app.js').read_text(encoding='utf-8')
parser=IdParser(); parser.feed(html)
required_ids={
 'scannerVideo','startCamera','stopCamera','switchCamera','torchButton','scanFile',
 'testQrButton','testImageButton','testQrStatus','scanOutput','copyScan','createFromScan','exportScanText',
 'exportProject','importProjectTrigger','projectImportInput','settingsImportProject',
 'qrCanvas','downloadPng','downloadSvg'
}
missing=required_ids-parser.ids
assert not missing, f'Missing UI elements: {sorted(missing)}'
for function in ['ensureJsQR','decodeQrSource','scanImageFile','startCamera','scanCameraFrame','runQrSelfTest','exportCurrentProject','importProjectFile','createQrFromScan']:
    assert re.search(r'function\s+'+re.escape(function)+r'\s*\(', js) or re.search(r'async\s+function\s+'+re.escape(function)+r'\s*\(', js), f'Missing function {function}'
assert 'BarcodeDetector' in js and 'getUserMedia' in js, 'Native camera path missing'
assert "inversionAttempts:'attemptBoth'" in js, 'Image inversion fallback missing'
assert 'foglabs-qr-studio-project' in js, 'QR Studio project format missing'
assert "currentQR.payload" in js and 'logoDataUrl' in js, 'Project export must preserve QR content and optional logo'
assert 'Il progetto esportato contiene le credenziali Wi-Fi in chiaro' in js, 'Sensitive Wi-Fi project export confirmation missing'
assert 'QR-STUDIO-SELF-TEST|FOGLABS|PASS' in js, 'End-to-end test payload missing'
assert 'function runSampleImageTest' in js and 'QR-STUDIO-IMAGE-IMPORT-TEST|FOGLABS|PASS' in js, 'Sample image test missing'
assert (SITE/'assets/qr-studio-test.png').is_file(), 'QR test sample PNG missing'
assert 'qr-studio-symbol.png' in html and (SITE/'assets/qr-studio-symbol.png').is_file(), 'Brand icon missing'
assert (SITE/'assets/icon-192.png').is_file() and (SITE/'assets/icon-512.png').is_file(), 'PWA icons missing'
assert "get('selftest')==='qr'" in js, 'URL-triggered browser self-test missing'
print('Scanner workflow smoke: camera, image-import, decoder fallback, test QR, QR project import/export, sensitive export warning, and brand assets present.')
