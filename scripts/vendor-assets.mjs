/**
 * Copies the runtime assets that libraries load by URL rather than by import
 * — pdf.js decoders and fonts, the libarchive worker, the SQLite engine — into
 * `public/`, so the app can run under `connect-src 'self'` and make no
 * outbound request at runtime. Run by postinstall; safe to re-run.
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const publicDir = join(root, "public", "vendor");

async function copy(from, to) {
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, force: true });
}

async function sizeOf(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    total += entry.isDirectory() ? await sizeOf(full) : (await stat(full)).size;
  }
  return total;
}

const pdfjs = join(modules, "pdfjs-dist");
for (const dir of ["wasm", "cmaps", "iccs", "standard_fonts"]) {
  await copy(join(pdfjs, dir), join(publicDir, "pdfjs", dir));
}

// libarchive.js resolves its wasm next to the worker script.
const libarchive = join(modules, "libarchive.js", "dist");
await copy(join(libarchive, "worker-bundle.js"), join(publicDir, "libarchive", "worker-bundle.js"));
await copy(join(libarchive, "libarchive.wasm"), join(publicDir, "libarchive", "libarchive.wasm"));

const sqljs = join(modules, "sql.js", "dist");
for (const name of ["sql-wasm.wasm", "sql-wasm-browser.wasm"]) {
  await copy(join(sqljs, name), join(publicDir, "sqljs", name));
}

// three.js's DRACOLoader fetches its decoder from a path at first use.
await copy(join(modules, "three", "examples", "jsm", "libs", "draco", "gltf"), join(publicDir, "draco"));

const bytes = await sizeOf(publicDir);
console.log(`Vendored runtime assets: ${(bytes / 1048576).toFixed(1)} MB`);
