type PdfjsModule = typeof import("pdfjs-dist");
type ViewerModule = typeof import("pdfjs-dist/web/pdf_viewer.mjs");

let loading: Promise<{ lib: PdfjsModule; viewer: ViewerModule }> | null = null;

/**
 * pdf.js and its viewer layer, loaded together and only when a PDF opens. The
 * viewer layer reads the core library from `globalThis.pdfjsLib`, so that has
 * to be set before it is imported.
 */
export function loadPdfjs() {
  loading ??= (async () => {
    const lib = await import("pdfjs-dist");
    lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    (globalThis as { pdfjsLib?: PdfjsModule }).pdfjsLib = lib;
    const viewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
    return { lib, viewer };
  })();
  return loading;
}

/**
 * Each of these would otherwise be fetched from a CDN at first use, breaking
 * `connect-src 'self'`. scripts/vendor-assets.mjs copies them into public/.
 */
export const PDF_ASSETS = {
  wasmUrl: "/vendor/pdfjs/wasm/",
  standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
  iccUrl: "/vendor/pdfjs/iccs/",
  cMapUrl: "/vendor/pdfjs/cmaps/",
  cMapPacked: true,
} as const;
