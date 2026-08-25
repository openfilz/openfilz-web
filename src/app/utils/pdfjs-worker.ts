import * as pdfjsLib from 'pdfjs-dist';

/**
 * Location of the pdf.js worker, bundled from node_modules/pdfjs-dist/build via the
 * angular.json assets glob (output /assets/pdfjs). Keeps the app free of CDN dependencies
 * (air-gapped deployments, CSP) and guarantees the worker version matches the library.
 *
 * The `?v=` is load-bearing, not decoration. Unlike Angular's own bundles this asset is copied
 * verbatim, so its filename carries no content hash — and nginx serves it with `expires 1y`.
 * Without the query a returning visitor would keep a cached worker across a pdfjs-dist upgrade
 * and pdf.js would reject it ("The API version does not match the Worker version"). Keying the
 * URL on the library version makes the cache entry change exactly when the worker does.
 *
 * nginx matches `location ~* \.mjs$` on the URI path, which excludes the query string, so the
 * MIME override still applies (verified against the deployed config).
 */
export const PDFJS_WORKER_SRC = `assets/pdfjs/pdf.worker.min.mjs?v=${pdfjsLib.version}`;
