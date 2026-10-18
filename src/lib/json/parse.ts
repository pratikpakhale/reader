export type JsonKind = "json" | "lenient" | "lines";

export interface ParsedJson {
  value: unknown;
  kind: JsonKind;
}

/**
 * JSON with comments and trailing commas made strict: comments become spaces
 * (so error positions still point at the right place) and a comma before a
 * closing bracket is dropped. Strings are skipped over intact.
 */
export function stripJsonExtras(text: string): string {
  let out = "";
  let from = 0;
  let index = 0;
  let pendingComma = -1;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      index++;
      while (index < text.length && text[index] !== '"') index += text[index] === "\\" ? 2 : 1;
      index++;
      pendingComma = -1;
      continue;
    }
    if (char === "/" && (text[index + 1] === "/" || text[index + 1] === "*")) {
      const block = text[index + 1] === "*";
      const end = block ? text.indexOf("*/", index + 2) : text.indexOf("\n", index + 2);
      const stop = end === -1 ? text.length : block ? end + 2 : end;
      out += text.slice(from, index) + text.slice(index, stop).replace(/[^\n]/g, " ");
      from = index = stop;
      continue;
    }
    if (char === ",") pendingComma = index;
    else if ((char === "}" || char === "]") && pendingComma !== -1) {
      out += text.slice(from, pendingComma) + " ";
      from = pendingComma + 1;
      pendingComma = -1;
    } else if (!/\s/.test(char)) pendingComma = -1;
    index++;
  }
  return out + text.slice(from);
}

/** One JSON value per line; blank lines are skipped. */
function parseLines(text: string): unknown[] {
  const records: unknown[] = [];
  let line = 0;
  for (const raw of text.split("\n")) {
    line++;
    if (!raw.trim()) continue;
    try {
      records.push(JSON.parse(raw));
    } catch (error) {
      throw new Error(`Line ${line}: ${(error as Error).message}`);
    }
  }
  return records;
}

/**
 * Strict JSON first; then JSON Lines when the name says so or the text reads
 * that way; then the lenient pass. The strict error is the one reported, as
 * it is the one that describes the file.
 */
export function parseJson(text: string, preferLines: boolean): ParsedJson {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (preferLines) {
    try {
      return { value: parseLines(source), kind: "lines" };
    } catch {
      // Some .jsonl files are a single JSON document; fall through.
    }
  }
  try {
    return { value: JSON.parse(source), kind: "json" };
  } catch (strict) {
    const trimmed = source.trim();
    if (trimmed.includes("\n") && /^[[{"\d-tfn]/.test(trimmed)) {
      try {
        const records = parseLines(source);
        if (records.length > 1) return { value: records, kind: "lines" };
      } catch {
        // Not JSON Lines either.
      }
    }
    try {
      return { value: JSON.parse(stripJsonExtras(source)), kind: "lenient" };
    } catch {
      throw strict;
    }
  }
}
