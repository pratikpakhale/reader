<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Reader.

Every supported format is one row in `src/lib/formats/registry.ts`; detection (`sniff.ts`), the landing page, the picker's `accept` and the manifest's file handlers all read from it. Add a format there first.

A viewer is `src/components/viewers/<id>-viewer.tsx`, default-exporting `({ doc }: ViewerProps)`, registered as a lazy chunk in `viewers/registry.tsx`. Build it from `src/components/viewer-kit.tsx` (frame, bar, buttons, status, `useLoad`, `useBlobUrl`) and `src/components/data-grid.tsx` for anything tabular, so every viewer looks and behaves alike.

Open files live in one Zustand store (`src/lib/library/store.ts`). Files found inside other files (archive entries, attachments) are opened with `openNested`, which keeps them under their parent.

No document ever leaves the device: the CSP in `next.config.ts` enforces it. Anything a library loads by URL (wasm, workers, fonts) is vendored into `public/vendor` by `scripts/vendor-assets.mjs`.
