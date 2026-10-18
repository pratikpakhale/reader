import type { GrammarState, HighlighterCore, ThemedToken } from "shiki/core";
import { bundledLanguagesInfo } from "shiki/langs";

/**
 * One highlighter for the whole app, built from the fine-grained core with the
 * JavaScript regex engine: no wasm and no CDN, which the CSP would refuse.
 * Grammars are fetched from the bundle only when a file first needs one.
 */

const THEMES = { light: "github-light", dark: "github-dark-dimmed" } as const;

/** Lines longer than this are left plain: minified bundles would stall the tokenizer. */
const MAX_LINE = 4000;

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter() {
  highlighter ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/themes"),
  ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }, { bundledThemes }]) =>
    createHighlighterCore({
      themes: [bundledThemes[THEMES.light], bundledThemes[THEMES.dark]],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    }),
  );
  return highlighter;
}

const PLAIN = new Set(["", "text", "txt", "plain", "plaintext"]);

/** The bundled grammar a language name or alias refers to, if any. */
function languageInfo(name: string | undefined) {
  const wanted = name?.trim().toLowerCase() ?? "";
  if (PLAIN.has(wanted)) return undefined;
  return bundledLanguagesInfo.find((info) => info.id === wanted || info.aliases?.includes(wanted));
}

export function isKnownLanguage(name: string | undefined): boolean {
  return Boolean(languageInfo(name));
}

/** Loads the grammar for `name` and returns its id, or null when it should stay plain. */
export async function loadLanguage(name: string | undefined): Promise<string | null> {
  const info = languageInfo(name);
  if (!info) return null;
  const shiki = await getHighlighter();
  if (!shiki.getLoadedLanguages().includes(info.id)) await shiki.loadLanguage(info.import);
  return info.id;
}

export interface TokenStyle {
  light: string;
  dark: string;
  italic: boolean;
  bold: boolean;
}

// Colours repeat endlessly across tokens, so each distinct style is stored once
// and tokens carry its index.
const styles: TokenStyle[] = [];
const styleIds = new Map<string, number>();

export function tokenStyle(index: number): TokenStyle {
  return styles[index];
}

function styleOf(token: ThemedToken): number {
  const css = (token.htmlStyle ?? {}) as Record<string, string>;
  const light = css["--shiki-light"] ?? "";
  const dark = css["--shiki-dark"] ?? "";
  const italic = css["--shiki-light-font-style"] === "italic";
  const bold = css["--shiki-light-font-weight"] === "bold";
  const key = `${light}|${dark}|${italic}|${bold}`;
  let id = styleIds.get(key);
  if (id === undefined) {
    id = styles.push({ light, dark, italic, bold }) - 1;
    styleIds.set(key, id);
  }
  return id;
}

/** A line's tokens as flat `[offset, style, offset, style, …]` pairs. */
export type LineTokens = Uint32Array;

/**
 * Tokenizes a run of lines, resuming from `state` — which is what lets a big
 * file be highlighted a slice at a time without losing a comment or string
 * that spans the cut.
 */
export async function tokenizeLines(
  code: string,
  language: string,
  state?: GrammarState,
): Promise<{ lines: LineTokens[]; state?: GrammarState }> {
  const shiki = await getHighlighter();
  const result = shiki.codeToTokens(code, {
    lang: language,
    themes: THEMES,
    defaultColor: false,
    tokenizeMaxLineLength: MAX_LINE,
    grammarState: state,
  });
  const lines = result.tokens.map((line) => {
    const flat = new Uint32Array(line.length * 2);
    line.forEach((token, index) => {
      flat[index * 2] = token.offset - (line[0]?.offset ?? 0);
      flat[index * 2 + 1] = styleOf(token);
    });
    return flat;
  });
  return { lines, state: result.grammarState };
}
