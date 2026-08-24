/**
 * Location of the pdf.js worker, bundled from node_modules/pdfjs-dist/build via the
 * angular.json assets glob (output /assets/pdfjs). Keeps the app free of CDN dependencies
 * (air-gapped deployments, CSP) and guarantees the worker version matches the library.
 */
export const PDFJS_WORKER_SRC = 'assets/pdfjs/pdf.worker.min.mjs';
