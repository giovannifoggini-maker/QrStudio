# QR Studio by FogLabs — Changelog

## v1.2.0
- Sfondo professionale graphite opaco, senza overlay neon animati o grandi sfocature.
- Pannelli solidi e ombre più leggere; transizioni ridotte.
- Scanner camera pianificato con timer a 260 ms invece di un ciclo `requestAnimationFrame` continuo.
- Risoluzione camera preferita ridotta a 960×540 e decoder fallback ridimensionato a 720 px per contenere l'uso CPU.
- Aggiornamento cache PWA e aggiunto test automatico anti-lag.

# Changelog — QR Studio by FogLabs

## v1.1.0
- Added QR reader fallback using version-pinned jsQR, loaded only when the user scans and the native browser detector is unavailable or does not return a result.
- Added camera facing switch and optional torch toggle when the device/browser exposes them.
- Added an in-app end-to-end QR self-test that generates a sample and verifies that a decoder can read it back.
- Added QR project JSON import/export, including payload, colors, correction level, output size, and optional logo.
- Added “recreate QR” and text export from a scanned result; image QR import now tries the native detector and the JS decoder fallback.
- Added a new FogLabs cyber scanner emblem, updated PWA icons and favicon, and improved camera/test panel symbols.
- Added scanner workflow integration tests and updated local pre-publication test launcher.
- Kept QR payload decoding on the device; Wi-Fi project export displays a warning because it may contain a password.

## v1.0.1
- Added a one-click Windows launcher for local pre-publication testing (`Avvia-QR-Studio.bat`).
- Added a Python standard-library localhost server on port 10000 with automatic fallback through 10099; it binds only to loopback and never uses port 8000.
- Added an HTTP smoke test for the local server and static resource delivery.
- Added `_headers` to the actual `site` output directory for Cloudflare Pages.

## v1.0.0
- Initial cyber-style QR Studio PWA, local QR generation, scan page, batch ZIP export, history, preferences, and GitHub/Cloudflare publication files.
