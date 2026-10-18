/**
 * A ZIP reader that works from the central directory at the end of the file,
 * so listing a 4 GB archive reads a few kilobytes, and opening one entry reads
 * only that entry's bytes. Stored and deflated entries are all we inflate
 * here; anything else (encryption, deflate64, bzip2, LZMA) is reported so the
 * caller can hand the archive to libarchive instead.
 */

export interface ZipEntry {
  path: string;
  size: number;
  compressedSize: number;
  method: number;
  encrypted: boolean;
  directory: boolean;
  /** Offset of the entry's local header. */
  offset: number;
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_COMMENT = 0xffff;

async function view(blob: Blob, start: number, end: number) {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

function u64(data: DataView, at: number) {
  return Number(data.getBigUint64(at, true));
}

const utf8 = new TextDecoder("utf-8");
// Pre-2007 tools wrote names in the DOS code page; 1252 is the closest the
// platform decodes, and it reads ASCII names identically.
const legacy = new TextDecoder("windows-1252");

export async function readZipDirectory(blob: Blob): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, blob.size - (22 + MAX_COMMENT));
  const tail = await view(blob, tailStart, blob.size);
  let eocd = -1;
  for (let at = tail.byteLength - 22; at >= 0; at -= 1) {
    if (tail.getUint32(at, true) === EOCD) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) throw new Error("No ZIP central directory found — the file may be truncated.");

  let count = tail.getUint16(eocd + 10, true);
  let size = tail.getUint32(eocd + 12, true);
  let start = tail.getUint32(eocd + 16, true);

  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) {
    const locator = eocd - 20;
    if (locator >= 0 && tail.getUint32(locator, true) === ZIP64_LOCATOR) {
      const at = u64(tail, locator + 8);
      const record = await view(blob, at, at + 56);
      if (record.getUint32(0, true) !== ZIP64_EOCD) throw new Error("Damaged ZIP64 directory.");
      count = u64(record, 32);
      size = u64(record, 40);
      start = u64(record, 48);
    }
  }

  const directory = await view(blob, start, start + size);
  const bytes = new Uint8Array(directory.buffer);
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let index = 0; index < count && at + 46 <= directory.byteLength; index += 1) {
    if (directory.getUint32(at, true) !== CENTRAL) throw new Error("Damaged ZIP central directory.");
    const flags = directory.getUint16(at + 8, true);
    const method = directory.getUint16(at + 10, true);
    let compressedSize = directory.getUint32(at + 20, true);
    let uncompressedSize = directory.getUint32(at + 24, true);
    const nameLength = directory.getUint16(at + 28, true);
    const extraLength = directory.getUint16(at + 30, true);
    const commentLength = directory.getUint16(at + 32, true);
    let offset = directory.getUint32(at + 42, true);

    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);
    const path = (flags & 0x800 ? utf8 : legacy).decode(nameBytes);

    // ZIP64 sizes live in an extra field, in this order, only for the values
    // that overflowed in the fixed header.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = directory.getUint16(extra, true);
      const length = directory.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        if (uncompressedSize === 0xffffffff) {
          uncompressedSize = u64(directory, field);
          field += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(directory, field);
          field += 8;
        }
        if (offset === 0xffffffff) offset = u64(directory, field);
      }
      extra += 4 + length;
    }

    entries.push({
      path,
      size: uncompressedSize,
      compressedSize,
      method,
      encrypted: (flags & 0x1) !== 0,
      directory: path.endsWith("/"),
      offset,
    });
    at = extraEnd + commentLength;
  }
  return entries;
}

export function zipCanInflate(entry: ZipEntry) {
  return !entry.encrypted && (entry.method === 0 || entry.method === 8);
}

/** The entry's bytes: stored entries are a zero-copy slice, deflated ones stream through the platform inflater. */
export async function readZipEntry(blob: Blob, entry: ZipEntry): Promise<Blob> {
  const local = await view(blob, entry.offset, entry.offset + 30);
  if (local.getUint32(0, true) !== LOCAL) throw new Error(`Damaged entry: ${entry.path}`);
  const dataStart = entry.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  const data = blob.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return data;
  const inflated = data.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(inflated).blob();
}
