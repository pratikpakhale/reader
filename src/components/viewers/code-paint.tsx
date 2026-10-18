import type { ReactNode } from "react";
import { tokenStyle, type LineTokens } from "@/lib/highlight/shiki";
import type { Theme } from "@/lib/highlight/theme";

/** A search hit inside a run of text: [start, end, isCurrent]. */
export type Mark = [number, number, boolean];

/**
 * Draws `text` (which begins `base` characters into its line) with the line's
 * tokens and any search marks laid over it. Cuts happen at every token and
 * mark edge, so a hit that straddles two tokens keeps both colours.
 */
export function paint(
  text: string,
  tokens: LineTokens | undefined,
  base: number,
  marks: Mark[],
  theme: Theme,
): ReactNode {
  if ((!tokens || tokens.length === 0) && marks.length === 0) return text;
  const cuts = new Set<number>([0, text.length]);
  if (tokens) {
    for (let index = 0; index < tokens.length; index += 2) {
      const at = tokens[index] - base;
      if (at > 0 && at < text.length) cuts.add(at);
    }
  }
  for (const [start, end] of marks) {
    cuts.add(Math.max(0, Math.min(text.length, start)));
    cuts.add(Math.max(0, Math.min(text.length, end)));
  }
  const points = [...cuts].sort((a, b) => a - b);

  const pieces: ReactNode[] = [];
  let token = 0;
  let mark = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (start >= end) continue;
    if (tokens) while (token + 2 < tokens.length && tokens[token + 2] - base <= start) token += 2;
    while (mark < marks.length && marks[mark][1] <= start) mark++;
    const hit = mark < marks.length && marks[mark][0] <= start ? marks[mark] : undefined;
    const style = tokens && tokens.length > 0 ? tokenStyle(tokens[token + 1]) : undefined;
    const piece = text.slice(start, end);
    if (hit) {
      pieces.push(
        <mark
          key={start}
          className={hit[2] ? "rounded-[2px] bg-seal-ink text-on-fill" : "rounded-[2px] bg-seal-wash text-inherit ring-1 ring-seal-ink/40"}
          style={!hit[2] && style ? { color: theme === "dark" ? style.dark : style.light } : undefined}
        >
          {piece}
        </mark>,
      );
    } else if (style) {
      pieces.push(
        <span
          key={start}
          style={{
            color: theme === "dark" ? style.dark : style.light,
            fontStyle: style.italic ? "italic" : undefined,
            fontWeight: style.bold ? 600 : undefined,
          }}
        >
          {piece}
        </span>,
      );
    } else {
      pieces.push(piece);
    }
  }
  return pieces;
}
