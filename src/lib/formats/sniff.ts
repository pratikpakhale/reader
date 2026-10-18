import {
  BINARY_FORMAT,
  formatById,
  formatByMime,
  formatByName,
  TEXT_FORMAT,
  type Format,
} from "./registry";

/**
 * Magic numbers that settle a file's kind regardless of its name. Checked
 * before the extension, so a `.db` that is not SQLite, or a PDF saved as
 * `.bin`, still lands in the right viewer.
 */
const SIGNATURES: Array<{ format: string; offset?: number; bytes: number[] | string }> = [
  { format: "pdf", bytes: "%PDF-" },
  { format: "image", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { format: "image", bytes: [0xff, 0xd8, 0xff] },
  { format: "image", bytes: "GIF8" },
  { format: "image", bytes: "BM" },
  { format: "sqlite", bytes: "SQLite format 3\0" },
  { format: "parquet", bytes: "PAR1" },
  { format: "psd", bytes: "8BPS" },
  { format: "tiff", bytes: [0x49, 0x49, 0x2a, 0x00] },
  { format: "tiff", bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { format: "rar", bytes: "Rar!" },
  { format: "rar", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { format: "tar", bytes: [0x1f, 0x8b] },
  { format: "tar", bytes: "BZh" },
  { format: "tar", bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
  { format: "tar", offset: 257, bytes: "ustar" },
  { format: "font", bytes: "wOFF" },
  { format: "font", bytes: "wOF2" },
  { format: "font", bytes: "OTTO" },
  { format: "font", bytes: [0x00, 0x01, 0x00, 0x00, 0x00] },
  { format: "model", bytes: "glTF" },
  { format: "audio", bytes: "ID3" },
  { format: "audio", bytes: "fLaC" },
  { format: "audio", bytes: "OggS" },
  { format: "rtf", bytes: "{\\rtf" },
];

const ALWAYS_SIGNED = new Set(["pdf", "sqlite", "parquet", "psd"]);

function matches(head: Uint8Array, offset: number, bytes: number[] | string) {
  const expected =
    typeof bytes === "string" ? [...bytes].map((c) => c.charCodeAt(0)) : bytes;
  if (head.length < offset + expected.length) return false;
  return expected.every((byte, index) => head[offset + index] === byte);
}

function ascii(head: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...head.subarray(from, to));
}

/** RIFF and ISO-BMFF wrap many formats; the brand inside says which. */
function container(head: Uint8Array): string | undefined {
  if (ascii(head, 0, 4) === "RIFF") {
    const kind = ascii(head, 8, 12);
    if (kind === "WEBP") return "image";
    if (kind === "WAVE") return "audio";
    if (kind === "AVI ") return "video";
  }
  if (ascii(head, 4, 8) === "ftyp") {
    const brand = ascii(head, 8, 12);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(brand)) return "heic";
    if (/^avi[fs]$/.test(brand)) return "image";
    if (/^(M4A |M4B |F4A )$/.test(brand)) return "audio";
    return "video";
  }
  if (matches(head, 0, [0x1a, 0x45, 0xdf, 0xa3])) return "video"; // Matroska / WebM
  return undefined;
}

/** Zip is the envelope for half of Office; the first entry's name gives it away. */
function zipFlavour(head: Uint8Array, name: string): string {
  const text = ascii(head, 0, Math.min(head.length, 2048));
  if (text.includes("mimetypeapplication/epub+zip")) return "epub";
  const byName = formatByName(name);
  if (byName && ["docx", "pptx", "xlsx", "epub", "notebook", "model"].includes(byName.id)) {
    return byName.id;
  }
  if (text.includes("word/")) return "docx";
  if (text.includes("ppt/")) return "pptx";
  if (text.includes("xl/")) return "xlsx";
  return "zip";
}

/**
 * Text is anything without NUL bytes and with almost no other control
 * characters. Encoding is not checked, so Latin-1 logs still open as text.
 */
export function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return true;
  if (matches(head, 0, [0xff, 0xfe]) || matches(head, 0, [0xfe, 0xff])) return true;
  let control = 0;
  for (const byte of head) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return control / head.length <= 0.02;
}

export function sniff(head: Uint8Array, name: string, mime = ""): Format {
  if (matches(head, 0, [0x50, 0x4b, 0x03, 0x04]) || matches(head, 0, [0x50, 0x4b, 0x05, 0x06])) {
    return formatById(zipFlavour(head, name));
  }

  for (const signature of SIGNATURES) {
    if (matches(head, signature.offset ?? 0, signature.bytes)) {
      // An icon or a TrueType collection shares a prefix with others; trust the
      // name when it agrees on the family.
      const byName = formatByName(name);
      const sniffed = formatById(signature.format);
      return byName && byName.family === sniffed.family ? byName : sniffed;
    }
  }

  const wrapped = container(head);
  if (wrapped) return formatById(wrapped);

  const byName = formatByName(name) ?? formatByMime(mime);
  // These always open with their signature, so a name without one is lying.
  if (byName && ALWAYS_SIGNED.has(byName.id)) return looksLikeText(head) ? TEXT_FORMAT : BINARY_FORMAT;
  if (byName) {
    // A name that promises text but holds binary goes to the hex view rather
    // than rendering mojibake.
    if (byName.viewer === "code" && !looksLikeText(head)) return BINARY_FORMAT;
    return byName;
  }

  if (looksLikeText(head)) {
    const text = new TextDecoder().decode(head).trimStart();
    if (/^[{[]/.test(text)) return formatById("json");
    if (/^<!doctype html|^<html/i.test(text)) return formatById("html");
    if (/^<svg|^<\?xml[^>]*>\s*<svg/i.test(text)) return formatById("svg");
    if (/^<\?xml/.test(text)) return formatById("xml");
    if (/^#!.*\b(ba|z|fi)?sh\b/.test(text)) return formatById("shellscript");
    if (/^#!.*\bpython/.test(text)) return formatById("python");
    if (/^#!.*\bnode/.test(text)) return formatById("javascript");
    if (/^(From |Received:|Return-Path:|MIME-Version:)/m.test(text.slice(0, 400))) {
      return formatById("email");
    }
    return TEXT_FORMAT;
  }

  return BINARY_FORMAT;
}

export async function detect(blob: Blob, name: string): Promise<Format> {
  const head = new Uint8Array(await blob.slice(0, 8192).arrayBuffer());
  return sniff(head, name, blob.type);
}
