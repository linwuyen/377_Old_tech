# Math rendering

KaTeX 0.19.1 is pinned in `package-lock.json` and distributed under its included MIT license (`katex/LICENSE`). The ESM `dist/katex.mjs` is copied byte-for-byte as `katex/katex.js` for static host MIME compatibility. CSS and font files are also hosted locally, so formulas do not depend on a third-party CDN.

To reproduce these assets: `npm ci`, then `npm run vendor:math`. Do not edit the vendored package directly.
