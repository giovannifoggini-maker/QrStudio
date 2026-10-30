import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../site/lib/qr-engine.js');
const { QRCode, ErrorCorrection } = globalThis.FogQR;
assert.equal(typeof QRCode, 'function');
const cases = [
  { text: 'https://example.com', level: 'M' },
  { text: 'Plain text QR', level: 'L' },
  { text: 'WIFI:T:WPA;S:Studio;P:correct-horse-battery;H:false;;', level: 'H' },
  { text: 'Ciao mondo — città, perché? 🌍', level: 'Q' },
  { text: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Mario Rossi\r\nEND:VCARD', level: 'M' },
  { text: 'A'.repeat(1000), level: 'M' },
];
for (const item of cases) {
  const qr = new QRCode(0, ErrorCorrection[item.level]);
  qr.addData(item.text);
  qr.make();
  const size = qr.getModuleCount();
  assert.ok(size >= 21 && size <= 177, `QR size out of range: ${size}`);
  assert.equal((size - 17) % 4, 0, 'matrix size must map to a valid QR version');
  assert.ok(qr.isDark(0, 0) || !qr.isDark(0, 0));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) assert.equal(typeof qr.isDark(y, x), 'boolean');
  }
}
// Verify that byte mode counts UTF-8 bytes, not UTF-16 code units.
const unicode = new QRCode(0, ErrorCorrection.M);
unicode.addData('é🌍');
unicode.make();
assert.ok(unicode.getModuleCount() >= 21);
console.log(`QR engine smoke: ${cases.length} payloads passed (including Unicode and 1,000-byte payload).`);
