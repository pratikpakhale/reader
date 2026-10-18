import type { Font, FontCollection } from "fontkit";

/**
 * Pulls one face out of a TrueType collection as a standalone font file.
 * The FontFace API only ever loads a collection's first face, so this is
 * how the second and later ones become renderable.
 */
export function extractFromCollection(bytes: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = source.getUint32(12 + index * 4);
  const count = source.getUint16(header + 4);
  const tables = Array.from({ length: count }, (_, table) => {
    const record = header + 12 + table * 16;
    return {
      tag: source.getUint32(record),
      checksum: source.getUint32(record + 4),
      offset: source.getUint32(record + 8),
      length: source.getUint32(record + 12),
    };
  });

  const align = (value: number) => (value + 3) & ~3;
  const directory = 12 + count * 16;
  const size = tables.reduce((total, table) => total + align(table.length), directory);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(bytes.subarray(header, header + 12), 0);

  let cursor = directory;
  tables.forEach((table, position) => {
    const record = 12 + position * 16;
    view.setUint32(record, table.tag);
    view.setUint32(record + 4, table.checksum);
    view.setUint32(record + 8, cursor);
    view.setUint32(record + 12, table.length);
    out.set(bytes.subarray(table.offset, table.offset + table.length), cursor);
    cursor += align(table.length);
  });
  return out;
}

export function isCollection(parsed: Font | FontCollection): parsed is FontCollection {
  return "fonts" in parsed && Array.isArray(parsed.fonts);
}

export interface FontFacts {
  axes: Array<{ tag: string; name: string; min: number; max: number; default: number }>;
  codePoints: number[];
}

const macRoman = new TextDecoder("macintosh");

/** Names from the Mac platform records come back as raw Mac Roman bytes. */
function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value instanceof Uint8Array) return macRoman.decode(value).trim();
  return "";
}

export function displayName(font: Font): string {
  return text(font.fullName) || text(font.postscriptName);
}

export function describe(font: Font): FontFacts {
  return {
    axes: Object.entries(font.variationAxes ?? {}).flatMap(([tag, axis]) => (axis ? [{ tag, ...axis }] : [])),
    codePoints: [...new Set(font.characterSet)].filter((codePoint) => codePoint > 0x20 && codePoint !== 0x7f).sort((a, b) => a - b),
  };
}
