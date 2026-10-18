# Reader.

Open any file in the browser, on any device, without uploading it. A sibling of
[PDF.](https://pdf.pakhale.com), built on the same bench and the same promise:
there is no server in a document's life.

## What it reads

| Family | Formats | Drawn with |
| --- | --- | --- |
| Documents | PDF, Word, PowerPoint, EPUB, RTF, Markdown, HTML, email | pdf.js, docx-preview, pptx-preview, epub.js, rtf.js, react-markdown, postal-mime |
| Data | Excel / Numbers / ODS, CSV, JSON & JSONL, SQLite, Parquet, Jupyter | SheetJS, Papa Parse, sql.js, hyparquet |
| Images | JPG, PNG, GIF, WebP, AVIF, SVG, HEIC, TIFF, PSD | the browser, heic-to, utif2, ag-psd |
| Audio & video | whatever the browser can decode | native media elements |
| Code & text | 200+ languages | Shiki |
| Archives | ZIP, TAR, GZ, RAR, 7z, ISO, CBZ/CBR … | fflate, nanotar, libarchive.js |
| 3D | glTF/GLB, STL, OBJ, FBX, PLY, 3MF, DAE, USDZ | three.js |
| Fonts | TTF, OTF, WOFF, WOFF2, TTC | FontFace API, fontkit |

Anything else opens as text if it is text, and in the hex view if it is not.
Detection reads magic bytes before trusting the extension, and "View as" lets
the reader override it.

## How it is built

- **One registry.** `src/lib/formats/registry.ts` is the single list of
  formats.
- **One viewer per chunk.** Each viewer is lazy-loaded, so opening a PDF never
  downloads three.js.
- **One route.** The landing page becomes the reader when the first file opens.
  Drop, paste, the picker and the OS "Open with" (installed as an app) all
  enter through `src/lib/library/intake.ts`.
- **Locked down by the browser.** `connect-src 'self'` and `form-action 'none'`
  in `next.config.ts`; wasm and workers are vendored into `public/vendor`.
- **Recents stay local.** Recently opened files are kept in IndexedDB on the
  device, can be cleared, and can be switched off.

## Running it

```bash
bun install      # also vendors runtime assets into public/vendor
bun run dev      # http://localhost:3000
bun run build
bun run lint
bun run typecheck
bun run test
```
