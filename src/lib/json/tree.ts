/**
 * A JSON value seen as a tree of rows. Only open containers contribute their
 * children, so the row list is as long as what is on screen could ever be —
 * never the whole document.
 */

type JsonKey = string | number | undefined;

export interface JsonRow {
  path: string;
  key: JsonKey;
  value: unknown;
  depth: number;
  /** Children, for objects and arrays; undefined for primitives. */
  count?: number;
  open: boolean;
  parent?: string;
}

/** Rows past this are not listed: a fully expanded 100 MB file has tens of millions. */
export const MAX_ROWS = 1_000_000;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function childPath(path: string, key: string | number) {
  if (typeof key === "number") return `${path}[${key}]`;
  return IDENTIFIER.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

export function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function entriesOf(value: object): Array<[string | number, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [index, item]);
  return Object.entries(value);
}

export function sizeOf(value: object) {
  return Array.isArray(value) ? value.length : Object.keys(value).length;
}

export interface OpenState {
  /** Containers shallower than this are open unless flipped. */
  depth: number;
  flipped: ReadonlySet<string>;
  /** Ancestors of search hits, held open while the search stands. */
  forced?: ReadonlySet<string>;
}

export function flatten(root: unknown, state: OpenState): { rows: JsonRow[]; truncated: boolean } {
  const rows: JsonRow[] = [];
  const stack: Array<Omit<JsonRow, "open" | "count">> = [{ path: "$", key: undefined, value: root, depth: 0 }];
  while (stack.length) {
    if (rows.length >= MAX_ROWS) return { rows, truncated: true };
    const item = stack.pop()!;
    if (!isContainer(item.value)) {
      rows.push({ ...item, open: false });
      continue;
    }
    const open = Boolean(state.forced?.has(item.path)) || item.depth < state.depth !== state.flipped.has(item.path);
    rows.push({ ...item, open, count: sizeOf(item.value) });
    if (!open) continue;
    const entries = entriesOf(item.value);
    for (let index = entries.length - 1; index >= 0; index--) {
      const [key, value] = entries[index];
      stack.push({ path: childPath(item.path, key), key, value, depth: item.depth + 1, parent: item.path });
    }
  }
  return { rows, truncated: false };
}


export const MAX_HITS = 5_000;

/** Keys and primitive values containing `needle`, case-insensitively, in document order. */
export function search(root: unknown, needle: string): { hits: string[]; ancestors: Set<string>; capped: boolean } {
  const wanted = needle.toLowerCase();
  const hits: string[] = [];
  const ancestors = new Set<string>();
  const stack: Array<{ path: string; key: JsonKey; value: unknown; trail: string[] }> = [
    { path: "$", key: undefined, value: root, trail: [] },
  ];
  while (stack.length) {
    const { path, key, value, trail } = stack.pop()!;
    const keyHit = typeof key === "string" && key.toLowerCase().includes(wanted);
    const valueHit = !isContainer(value) && String(value).toLowerCase().includes(wanted);
    if (keyHit || valueHit) {
      hits.push(path);
      for (const ancestor of trail) ancestors.add(ancestor);
      if (hits.length >= MAX_HITS) return { hits, ancestors, capped: true };
    }
    if (isContainer(value)) {
      const entries = entriesOf(value);
      const next = [...trail, path];
      for (let index = entries.length - 1; index >= 0; index--) {
        const [childKey, child] = entries[index];
        stack.push({ path: childPath(path, childKey), key: childKey, value: child, trail: next });
      }
    }
  }
  return { hits, ancestors, capped: false };
}
