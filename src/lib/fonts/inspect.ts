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

/** Scripts worth naming, tested with Unicode property escapes rather than a range table we'd have to keep. */
const SCRIPTS = [
  "Latin", "Greek", "Cyrillic", "Armenian", "Hebrew", "Arabic", "Syriac", "Thaana", "Devanagari", "Bengali",
  "Gurmukhi", "Gujarati", "Oriya", "Tamil", "Telugu", "Kannada", "Malayalam", "Sinhala", "Thai", "Lao",
  "Tibetan", "Myanmar", "Georgian", "Hangul", "Ethiopic", "Cherokee", "Khmer", "Mongolian", "Hiragana",
  "Katakana", "Bopomofo", "Han", "Yi", "Javanese", "Tifinagh", "Canadian_Aboriginal",
] as const;

const SCRIPT_TESTS = SCRIPTS.map((script) => ({
  name: script.replace(/_/g, " "),
  test: new RegExp(`^\\p{Script=${script}}$`, "u"),
}));

/** Scripts the font covers, with how many of their characters it draws, most first. */
export function scriptsOf(codePoints: number[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const codePoint of codePoints) {
    const char = String.fromCodePoint(codePoint);
    const hit = SCRIPT_TESTS.find((script) => script.test.test(char));
    if (hit) counts.set(hit.name, (counts.get(hit.name) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= 10)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

const FEATURES: Record<string, string> = {
  aalt: "Access all alternates",
  c2sc: "Small caps from capitals",
  calt: "Contextual alternates",
  case: "Case-sensitive forms",
  ccmp: "Glyph composition",
  clig: "Contextual ligatures",
  cpsp: "Capital spacing",
  dlig: "Discretionary ligatures",
  dnom: "Denominators",
  frac: "Fractions",
  hist: "Historical forms",
  init: "Initial forms",
  isol: "Isolated forms",
  kern: "Kerning",
  liga: "Standard ligatures",
  lnum: "Lining figures",
  locl: "Localized forms",
  mark: "Mark positioning",
  medi: "Medial forms",
  mkmk: "Mark-to-mark positioning",
  numr: "Numerators",
  onum: "Oldstyle figures",
  ordn: "Ordinals",
  pnum: "Proportional figures",
  rlig: "Required ligatures",
  salt: "Stylistic alternates",
  sinf: "Scientific inferiors",
  smcp: "Small capitals",
  ss01: "Stylistic set 1",
  subs: "Subscript",
  sups: "Superscript",
  swsh: "Swash",
  tnum: "Tabular figures",
  zero: "Slashed zero",
  fina: "Terminal forms",
};

export function featureName(tag: string): string {
  if (FEATURES[tag]) return FEATURES[tag];
  const set = /^ss(\d\d)$/.exec(tag);
  if (set) return `Stylistic set ${Number(set[1])}`;
  const variant = /^cv(\d\d)$/.exec(tag);
  if (variant) return `Character variant ${Number(variant[1])}`;
  return "";
}

export interface FontFacts {
  family: string;
  subfamily: string;
  fullName: string;
  facts: Array<[string, string]>;
  features: string[];
  axes: Array<{ tag: string; name: string; min: number; max: number; default: number }>;
  codePoints: number[];
  scripts: Array<{ name: string; count: number }>;
}

function macRomanDecoder() {
  try {
    return new TextDecoder("macintosh");
  } catch {
    // Agrees with Mac Roman on ASCII, which is nearly every font name.
    return new TextDecoder("latin1");
  }
}
const macRoman = macRomanDecoder();

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
  const name = (key: string) => {
    try {
      return text(font.getName(key, "en"));
    } catch {
      return "";
    }
  };
  const codePoints = [...new Set(font.characterSet)].filter((codePoint) => codePoint > 0x20 && codePoint !== 0x7f).sort((a, b) => a - b);
  const axes = Object.entries(font.variationAxes ?? {}).flatMap(([tag, axis]) => (axis ? [{ tag, ...axis }] : []));
  const facts: Array<[string, unknown]> = [
    ["Family", font.familyName],
    ["Style", font.subfamilyName],
    ["Full name", font.fullName],
    ["PostScript name", font.postscriptName],
    ["Version", name("version")],
    ["Designer", name("designer")],
    ["Manufacturer", name("manufacturer")],
    ["Vendor ID", font["OS/2"]?.vendorID?.trim() ?? ""],
    ["Glyphs", font.numGlyphs.toLocaleString()],
    ["Characters", codePoints.length.toLocaleString()],
    ["Units per em", String(font.unitsPerEm)],
    ["Weight class", font["OS/2"] ? String(font["OS/2"].usWeightClass) : ""],
    ["Container", font.type],
    ["Description", name("description")],
    ["Copyright", font.copyright ?? ""],
    ["Trademark", name("trademark")],
    ["License", name("license")],
    ["License URL", name("licenseURL")],
    ["Designer URL", name("designerURL")],
    ["Vendor URL", name("manufacturerURL")],
  ];
  return {
    family: text(font.familyName),
    subfamily: text(font.subfamilyName),
    fullName: text(font.fullName),
    facts: facts
      .map(([label, value]): [string, string] => [label, text(value)])
      .filter(([, value]) => value),
    features: [...new Set(font.availableFeatures ?? [])].sort(),
    axes,
    codePoints,
    scripts: scriptsOf(codePoints),
  };
}
