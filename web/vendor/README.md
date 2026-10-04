# Vendored libraries

Served from this folder so the stage never depends on venue Wi-Fi or a CDN.
Copied unchanged from the npm packages on 2026-10-04. To update one, run
`npm pack <name>@<version>` and copy the same file over.

| File | Package | License |
| --- | --- | --- |
| `gsap.min.js` | [gsap](https://gsap.com) 3.15.0, `dist/gsap.min.js` | GSAP [Standard "no charge" license](https://gsap.com/standard-license) |
| `ScrambleTextPlugin.min.js` | gsap 3.15.0, `dist/ScrambleTextPlugin.min.js` | same as above |
| `rough-notation.esm.js` | [rough-notation](https://roughnotation.com) 0.5.1, `lib/rough-notation.esm.js` | MIT, see `LICENSE-rough-notation.txt` |
| `qrcode.mjs` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4, `dist/qrcode.mjs` | MIT, Copyright (c) 2009 Kazuhiko Arase; notice kept in the file header |

GSAP and ScrambleText load as classic scripts and expose `window.gsap`; the
other two are ES modules imported by `fx.js` and `qr.js`. "QR Code" is a
registered trademark of DENSO WAVE INCORPORATED.
