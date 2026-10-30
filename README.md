# QR Studio by FogLabs — v1.2.0

QR Studio è una PWA in stile cyber per PC e telefono. Crea QR code senza inviare il contenuto a un server, legge QR con fotocamera o immagini, permette di importare/esportare progetti e dispone di un test QR integrato.

## Funzioni

- QR per URL, testo Unicode, Wi‑Fi, email, telefono, SMS, contatto vCard e coordinate GPS.
- Motore di generazione QR incluso, con esportazione PNG e SVG.
- Personalizzazione colori, livelli di correzione L/M/Q/H e logo centrale; se c'è un logo il livello H viene imposto per migliorare la tolleranza agli errori.
- Lettura QR da fotocamera e immagini: usa `BarcodeDetector` nativo quando disponibile e prova `jsQR` come decoder di riserva quando necessario.
- Controlli fotocamera: selezione frontale/posteriore e torcia se il dispositivo le espone.
- **Test QR end-to-end**: genera un QR campione e verifica che un decoder reale riesca a leggerlo.
- Importa un'immagine QR dalla sezione Scanner e usa **Ricrea QR** per trasformare il contenuto letto in un nuovo codice.
- Esporta il QR in PNG/SVG oppure esporta un progetto `.qrstudio.json` con contenuto, colori, livello di correzione, dimensione e logo; puoi importare quel progetto in seguito.
- ZIP batch fino a 100 QR, cronologia locale (i QR Wi-Fi non vengono inseriti nella cronologia), preferenze esportabili, PWA e layout responsive.
- Nuovo emblema cyber FogLabs, icone PWA e simboli SVG per la navigazione.

## Avvio locale per provare prima di pubblicare (Windows / Python 3.13)

1. Estrai lo ZIP completo in una cartella.
2. Fai doppio clic su `Avvia-QR-Studio.bat`.
3. Si aprirà il browser all'indirizzo stampato nella finestra, normalmente `http://localhost:10000`.
4. Lascia aperta la finestra mentre provi QR Studio; premi `CTRL+C` per arrestare il server.

Il launcher usa Python 3.13 se disponibile e non richiede pacchetti Python aggiuntivi. Il server ascolta soltanto su `127.0.0.1` e, se la porta 10000 è occupata, prova automaticamente quelle fino a 10099; non usa la porta 8000.

Per verificare il pacchetto prima della pubblicazione esegui `Test-QR-Studio.bat`. Si può anche usare `python run_local.py --no-browser` per avviare senza aprire automaticamente il browser.

## Lettura dalla fotocamera e compatibilità

La fotocamera richiede un contesto sicuro: HTTPS sul sito pubblicato oppure `localhost` per il test locale. Consenti l'accesso alla fotocamera nel browser. L'app usa il rilevatore QR nativo del browser quando disponibile; altrimenti carica su richiesta il decoder `jsQR` versione 1.4.0 da jsDelivr e, come alternativa, da unpkg. Questo caricamento avviene solo quando si tenta una scansione; se il browser non dispone del rilevatore nativo, il primo uso del fallback richiede Internet. Il payload QR rimane sul dispositivo e non viene inviato al CDN. Senza rete e senza `BarcodeDetector`, quel fallback non può essere caricato.

La torcia e il cambio fotocamera dipendono dalle funzioni esposte dal dispositivo/browser. Il test QR automatico controlla generazione e decodifica nello stesso browser; per controllare anche la fotocamera reale, avvia il lettore e inquadra un QR stampato o mostrato su un secondo schermo.

## Importazione ed esportazione

- `Scarica PNG` e `Scarica SVG` esportano il codice visibile.
- `Esporta progetto QR` crea un file `.qrstudio.json` riapribile dal pulsante `Importa progetto`.
- `Carica un'immagine QR` legge QR da file immagine; `Ricrea QR` porta il testo letto al generatore.
- Esportare un progetto Wi‑Fi può includere una password in chiaro: QR Studio chiede una conferma prima di salvarlo.

## Pubblicazione gratuita

### GitHub Pages

Carica tutto il progetto in un repository GitHub, mantenendo `.github/workflows/deploy-pages.yml` e `site`. Imposta `main` come ramo principale; in `Settings → Pages` seleziona `GitHub Actions`. Il workflow pubblica la cartella `site` a ogni push su `main`.

### Cloudflare Pages

Collega il repository: ramo `main`, comando build `exit 0`, cartella di output `site`, cartella radice vuota. `site/_headers` contiene le intestazioni di sicurezza.

## Test

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

Il test Python di decodifica usa OpenCV soltanto nell'ambiente di sviluppo e non è una dipendenza della PWA. Il test automatico dell'interfaccia è accessibile dal pannello Scanner; per il test browser headless apri `/?selftest=qr` sul server locale.

## Privacy e licenze

I QR vengono generati e decodificati nel browser, senza inviare il payload a FogLabs o al CDN. La cronologia e le preferenze restano nel `localStorage` del browser e non si sincronizzano fra dispositivi. I QR Wi‑Fi sono esclusi dalla cronologia, ma esportare un progetto Wi‑Fi salva le credenziali nel file locale.

Il codice FogLabs è MIT (`LICENSE`). Il motore encoder QR include QRCode for JavaScript di Kazuhiko Arase: consulta gli avvisi in `licenses`. Il decoder opzionale `jsQR` 1.4.0 è distribuito con licenza Apache 2.0 e viene caricato da CDN su richiesta; l'attribuzione è in `licenses/jsQR-ATTRIBUTION.txt`.

## Ottimizzazioni v1.2.0
- Tema graphite opaco e sobrio, senza sfondi sfocati o scanline animate.
- Scanner fotocamera meno impegnativo: scansione temporizzata ogni 260 ms, camera 960×540 e downscaling del decoder.
- Esegui `Test-QR-Studio.bat` per includere il controllo automatico delle prestazioni.
