/**
 * One interface over every archive the reader opens. ZIP is read in place
 * from its central directory, TAR and gzip are unpacked in JS, and the long
 * tail — RAR, 7z, ISO, CAB, bzip2/xz tarballs, encrypted ZIPs — goes to
 * libarchive's WebAssembly build in a worker.
 */

import { parseTar } from "nanotar";
import { readZipDirectory, readZipEntry, zipCanInflate, type ZipEntry } from "./zip";

export interface ArchiveEntry {
  /** Normalised: no leading `./` or `/`. */
  path: string;
  size: number;
}

export interface OpenedArchive {
  entries: ArchiveEntry[];
  /** True while a password is needed and has not been given. */
  locked: boolean;
  extract(path: string): Promise<Blob>;
  /** Tries a password; resolves with the (possibly newly readable) listing. */
  unlock(password: string): Promise<ArchiveEntry[]>;
  close(): void;
}

export class PasswordError extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? "That password didn't work." : "This archive needs a password.");
  }
}

const LIBARCHIVE_WORKER = "/vendor/libarchive/worker-bundle.js";

function normalise(path: string) {
  return path.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "");
}

/** macOS resource forks: metadata, never content anyone opened the archive for. */
function isJunk(path: string) {
  return path.startsWith("__MACOSX/") || /(^|\/)\._[^/]*$/.test(path);
}

function listing(paths: Iterable<ArchiveEntry>) {
  return [...paths].filter((entry) => entry.path && !isJunk(entry.path));
}

/** For formats that never ask for a password. */
function unencrypted(
  entries: ArchiveEntry[],
  extract: (path: string) => Promise<Blob>,
  close: () => void,
): OpenedArchive {
  return { entries, locked: false, extract, unlock: async () => entries, close };
}

function fromBytes(files: Map<string, Uint8Array>): OpenedArchive {
  return unencrypted(
    listing([...files].map(([path, data]) => ({ path, size: data.length }))),
    async (path) => {
      const data = files.get(path);
      if (!data) throw new Error(`Not in this archive: ${path}`);
      return new Blob([data as Uint8Array<ArrayBuffer>]);
    },
    () => files.clear(),
  );
}

function openTar(buffer: ArrayBuffer): OpenedArchive {
  const files = new Map<string, Uint8Array>();
  for (const item of parseTar(buffer)) {
    if (item.type && item.type !== "file" && item.type !== "contiguousFile") continue;
    files.set(normalise(item.name), item.data ?? new Uint8Array());
  }
  return fromBytes(files);
}

function isTar(bytes: Uint8Array) {
  return String.fromCharCode(...bytes.subarray(257, 262)) === "ustar";
}

/** Streams through the platform inflater, so a large tarball never blocks the page. */
async function inflateGzip(blob: Blob) {
  return new Uint8Array(await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

/** The name gzip stored for its one file, when it kept one. */
function gzipName(bytes: Uint8Array): string | undefined {
  const flags = bytes[3];
  if (!(flags & 0x08)) return undefined;
  let at = 10;
  if (flags & 0x04) at += 2 + (bytes[10] | (bytes[11] << 8));
  const end = bytes.indexOf(0, at);
  return end > at ? new TextDecoder("latin1").decode(bytes.subarray(at, end)) : undefined;
}

async function openGzip(blob: Blob, name: string): Promise<OpenedArchive> {
  const data = await inflateGzip(blob);
  if (isTar(data)) return openTar(data.buffer);
  const inner =
    gzipName(new Uint8Array(await blob.slice(0, 1024).arrayBuffer())) ??
    (name.replace(/\.(t)gz$/i, ".$1ar").replace(/\.(gz|gzip)$/i, "") || "content");
  return fromBytes(new Map([[normalise(inner).split("/").pop()!, data]]));
}

function openZip(blob: Blob, entries: ZipEntry[]): OpenedArchive {
  const byPath = new Map(entries.filter((entry) => !entry.directory).map((entry) => [normalise(entry.path), entry]));
  return unencrypted(
    listing([...byPath].map(([path, entry]) => ({ path, size: entry.size }))),
    async (path) => {
      const entry = byPath.get(path);
      if (!entry) throw new Error(`Not in this archive: ${path}`);
      return readZipEntry(blob, entry);
    },
    () => byPath.clear(),
  );
}

function isPasswordProblem(error: unknown) {
  return error instanceof Error && /passphrase|password|encrypt/i.test(error.message);
}

async function openLibarchive(blob: Blob, name: string): Promise<OpenedArchive> {
  const { Archive } = await import("libarchive.js");
  Archive.init({ workerUrl: LIBARCHIVE_WORKER });
  const reader = await Archive.open(blob instanceof File ? blob : new File([blob], name));
  // The worker paths keep any leading `./`; remember the original for extraction.
  const original = new Map<string, string>();

  const list = async (): Promise<ArchiveEntry[]> => {
    const files: Array<{ file: { name: string; size: number }; path: string }> = await reader.getFilesArray();
    original.clear();
    return listing(
      files.map(({ file, path: folder }) => {
        const raw = `${folder}${file.name}`;
        const path = normalise(raw);
        original.set(path, raw);
        return { path, size: file.size };
      }),
    );
  };

  const encrypted = (await reader.hasEncryptedData()) === true;
  let entries: ArchiveEntry[] = [];
  let locked = encrypted;
  try {
    entries = await list();
  } catch (error) {
    // 7z and RAR5 can encrypt the listing itself.
    if (!isPasswordProblem(error)) throw error;
    locked = true;
  }

  const extract = async (path: string) => {
    try {
      return await reader.extractSingleFile(original.get(path) ?? path);
    } catch (error) {
      if (isPasswordProblem(error)) throw new PasswordError(/incorrect|wrong|bad/i.test((error as Error).message));
      throw error;
    }
  };

  return {
    entries,
    locked,
    extract,
    unlock: async (password) => {
      await reader.usePassword(password);
      const next = entries.length ? entries : await list().catch((error: unknown) => {
        throw isPasswordProblem(error) ? new PasswordError(true) : error;
      });
      // Prove the password on the smallest file rather than on whatever the
      // user clicks next.
      const probe = next
        .filter((entry) => entry.size > 0)
        .reduce<ArchiveEntry | undefined>((smallest, entry) => (!smallest || entry.size < smallest.size ? entry : smallest), undefined);
      if (probe) {
        try {
          await extract(probe.path);
        } catch (error) {
          throw error instanceof PasswordError ? new PasswordError(true) : error;
        }
      }
      entries = next;
      return next;
    },
    close: () => void reader.close(),
  };
}

export async function openArchive(blob: Blob, name: string): Promise<OpenedArchive> {
  const head = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
  const zip = head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5 || head[2] === 7);

  if (zip) {
    const entries = await readZipDirectory(blob).catch(() => null);
    // Encrypted or exotically compressed entries are libarchive's job.
    if (entries && entries.every((entry) => entry.directory || zipCanInflate(entry))) return openZip(blob, entries);
  } else if (head[0] === 0x1f && head[1] === 0x8b) {
    return openGzip(blob, name);
  } else if (isTar(head) || /\.tar$/i.test(name)) {
    return openTar(await blob.arrayBuffer());
  }
  return openLibarchive(blob, name);
}
