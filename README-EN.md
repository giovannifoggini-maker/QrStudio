# QR Studio by FogLabs — v1.2.0

A cyber-styled Progressive Web App for desktop and mobile. Create QR codes locally, read them from the camera or image files, and import/export reusable QR projects. Includes an in-app end-to-end QR self-test.

## Features

- QR payloads for URLs, Unicode text, Wi-Fi, email, phone, SMS, vCard contacts and GPS coordinates.
- Bundled client-side QR encoder; PNG and SVG downloads.
- Foreground/background colors, L/M/Q/H correction and a centered logo. H correction is enforced when a logo is present.
- Camera and image scanning: native browser `BarcodeDetector` first, optional `jsQR` v1.4.0 fallback when needed.
- Camera switching and flashlight toggle when the device/browser exposes those capabilities.
- An end-to-end test QR button that generates a sample code and verifies that a real decoder can read it back.
- Image import from the Scanner view, plus “Recreate QR” to send scanned text to the generator.
- Export QR projects to `.qrstudio.json`, preserving payload, colors, correction level, size and optional logo; import the project later.
- Batch ZIP export for up to 100 codes, local history (Wi-Fi codes excluded), settings export, installable PWA, responsive mobile UI and new cyber brand emblem/icons.

## Run locally before publishing (Windows / Python 3.13)

1. Extract the full ZIP.
2. Double-click `Avvia-QR-Studio.bat`.
3. A browser opens at the address printed in the console, normally `http://localhost:10000`.
4. Keep the console open while testing; press `CTRL+C` to stop the server.

The launcher prefers Python 3.13 and uses only the Python standard library. It binds only to `127.0.0.1`. If port 10000 is busy, it tries ports through 10099 and never uses port 8000. Run `Test-QR-Studio.bat` before publishing. You can use `python run_local.py --no-browser` to start the server without opening a browser.

## Camera scanning and compatibility

Camera access requires a secure context: HTTPS on the published site or `localhost` for local tests. Grant the browser camera permission. QR Studio uses the native browser detector when available; otherwise it loads the version-pinned `jsQR` 1.4.0 decoder on demand from jsDelivr, with unpkg as fallback. This network request occurs only when scanning is requested. When the native detector is absent, the first fallback use requires an internet connection. QR payloads stay on-device and are not sent to the CDN. Without network access and without native `BarcodeDetector`, that fallback cannot be loaded.

Camera switching and torch controls depend on device/browser support. The built-in self-test checks generator-to-decoder round-trip in the current browser. To test the physical camera, start the scanner and point it at a printed QR or one displayed on another screen.

## Import and export

- PNG and SVG buttons export the visible QR.
- `Export QR project` creates a `.qrstudio.json` file that can be reopened through `Import project`.
- `Load a QR image` decodes QR images; `Recreate QR` transfers decoded content to the generator.
- Exporting a Wi-Fi project can include the password in plaintext; the app asks for confirmation first.

## GitHub Pages

Upload the whole project to a GitHub repository, keep `.github/workflows/deploy-pages.yml` and `site`, set `main` as the default branch, and select **GitHub Actions** under `Settings → Pages`. The workflow deploys `site` on every push to `main`.

## Cloudflare Pages

Connect the repository; branch `main`, build command `exit 0`, output directory `site`, root directory blank. `site/_headers` contains security headers.

## Tests

```bash
node --check site/app.js
node --check site/lib/qr-engine.js
node --check site/sw.js
node tests/qr-engine-smoke.mjs
python tests/qr-decode-smoke.py
python tests/static-smoke.py
python tests/scanner-workflow-smoke.py
python tests/local-server-smoke.py
```

The optional OpenCV decoder test is a development test only, not an app dependency. The interactive QR self-test is available in the Scanner view or by opening `/?selftest=qr` on the local server. To test image import, press `Read sample image` or load `site/assets/qr-studio-test.png` in the Scanner view.

## Privacy and licenses

QR payloads are generated and decoded in the browser; they are not sent to FogLabs or the decoder CDN. History and preferences stay in localStorage and do not sync between devices. Wi-Fi QR codes are excluded from history, but exported Wi-Fi project files may contain credentials.

FogLabs application code is MIT-licensed (`LICENSE`). The QR encoder includes QRCode for JavaScript by Kazuhiko Arase; see `licenses`. The optional `jsQR` 1.4.0 decoder is Apache-2.0 and loaded from a CDN on demand; attribution is in `licenses/jsQR-ATTRIBUTION.txt`.

## v1.2.0 performance updates
- Professional matte graphite background, with no blurred ambient layers or animated scanlines.
- Lower camera scanning overhead: timer-based scanning every 260 ms, 960×540 camera target and decoder downscaling.
- Run `Test-QR-Studio.bat` to include the performance regression check.
