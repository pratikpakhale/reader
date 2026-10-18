"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { AArrowDown, AArrowUp, ChevronDown, ChevronUp, Copy, WrapText } from "lucide-react";
import { cn } from "@/lib/cn";
import type { GrammarState } from "shiki/core";
import { languageLabel, loadLanguage, tokenizeLines, type LineTokens } from "@/lib/highlight/shiki";
import { useTheme } from "@/lib/highlight/theme";
import { BarDivider, BarSpacer, Readout, SearchField, ToolButton, ViewerBar, ViewerFrame } from "@/components/viewer-kit";
import { paint, type Mark } from "./code-paint";

/** Above this many characters the file is drawn plain: tokenizing it would take too long to be worth it. */
const HIGHLIGHT_LIMIT = 2_000_000;
/** A line longer than this is broken into continuation rows, so a minified file still scrolls. */
const SEGMENT = 10_000;
const MAX_MATCHES = 100_000;
const FONT_KEY = "reader-code-font";
const NO_TOKENS: LineTokens = new Uint32Array(0);
const PROSE = new Set(["text", "markdown", "log", "latex"]);

/**
 * Rows of the text: where each starts and ends, and which line it belongs to.
 * Usually one row per line; overlong lines become several.
 */
function layout(text: string) {
  const starts: number[] = [];
  const ends: number[] = [];
  const lineOf: number[] = [];
  const lineStarts: number[] = [];
  let widest = 0;
  let line = 0;
  let position = 0;
  while (position <= text.length) {
    let next = text.indexOf("\n", position);
    if (next === -1) next = text.length;
    const end = next > position && text.charCodeAt(next - 1) === 13 ? next - 1 : next;
    let from = position;
    lineStarts.push(position);
    do {
      const to = Math.min(end, from + SEGMENT);
      starts.push(from);
      ends.push(to);
      lineOf.push(line);
      widest = Math.max(widest, to - from);
      from = to;
    } while (from < end);
    line++;
    position = next + 1;
  }
  return {
    starts: Uint32Array.from(starts),
    ends: Uint32Array.from(ends),
    lineOf: Uint32Array.from(lineOf),
    lineStarts: Uint32Array.from(lineStarts),
    lines: line,
    widest,
  };
}

/** Index of the last entry in `sorted` that is <= `value`. */
function floorIndex(sorted: ArrayLike<number>, value: number) {
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (sorted[middle] <= value) low = middle;
    else high = middle - 1;
  }
  return low;
}

function findMatches(text: string, needle: string): number[] {
  if (!needle) return [];
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const found: number[] = [];
  for (let hit = pattern.exec(text); hit && found.length < MAX_MATCHES; hit = pattern.exec(text)) {
    found.push(hit.index);
  }
  return found;
}

function diffTint(line: string) {
  if (line.startsWith("+++") || line.startsWith("---")) return "font-semibold";
  if (line.startsWith("+")) return "bg-seal-wash";
  if (line.startsWith("-")) return "bg-breach/10";
  if (line.startsWith("@@")) return "bg-sunken text-ink-soft";
  return undefined;
}

/**
 * The text body every textual viewer falls back to: virtualised lines, a
 * gutter, search, wrap and size. `leading` goes at the start of the bar, so a
 * viewer offering a Source mode can keep its own toggle in reach.
 */
export function CodeView({
  text,
  language,
  leading,
  notice,
}: {
  text: string;
  language?: string;
  leading?: ReactNode;
  /** A short note for the bar, e.g. that the file was cut short. */
  notice?: string;
}) {
  const theme = useTheme();
  const scroller = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => layout(text), [text]);
  const [wrap, setWrap] = useState(() => PROSE.has(language ?? "text") || rows.widest > 2000);
  const [fontSize, setFontSize] = useState(() => {
    const stored = Number(localStorage.getItem(FONT_KEY));
    return stored >= 10 && stored <= 22 ? stored : 13;
  });
  const lineHeight = Math.round(fontSize * 1.62);

  // Highlighting, one time-slice at a time, so a 2 MB file paints at once and
  // colours in from the top without ever holding the main thread.
  const [highlight, setHighlight] = useState<{ text: string; grammar: string; lines: LineTokens[] } | null>(null);
  const tooBig = text.length > HIGHLIGHT_LIMIT;
  useEffect(() => {
    if (tooBig) return;
    let cancelled = false;
    (async () => {
      const grammar = await loadLanguage(language);
      if (cancelled || !grammar) return;
      const lines: LineTokens[] = [];
      let state: GrammarState | undefined;
      let slice = performance.now();
      while (lines.length < rows.lines) {
        const last = Math.min(rows.lines, lines.length + 200);
        const to = last >= rows.lines ? text.length : rows.lineStarts[last] - 1;
        const result = await tokenizeLines(text.slice(rows.lineStarts[lines.length], to), grammar, state);
        if (cancelled) return;
        for (let index = lines.length, from = index; index < last; index++) lines.push(result.lines[index - from] ?? NO_TOKENS);
        state = result.state;
        if (performance.now() - slice > 24 || lines.length >= rows.lines) {
          setHighlight({ text, grammar, lines: lines.slice() });
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (cancelled) return;
          slice = performance.now();
        }
      }
    })().catch(() => !cancelled && setHighlight(null));
    return () => {
      cancelled = true;
    };
  }, [text, language, rows, tooBig]);
  const live = highlight?.text === text ? highlight : null;

  const [query, setQuery] = useState("");
  const needle = useDeferredValue(query);
  const matches = useMemo(() => findMatches(text, needle), [text, needle]);
  const [cursor, setCursor] = useState({ matches, index: 0 });
  const current = cursor.matches === matches ? cursor.index : 0;

  const virtualizer = useVirtualizer({
    count: rows.starts.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => {
      if (!wrap) return lineHeight;
      const columns = Math.max(20, ((scroller.current?.clientWidth ?? 800) - 80) / (fontSize * 0.6));
      return lineHeight * Math.max(1, Math.ceil((rows.ends[index] - rows.starts[index]) / columns));
    },
    overscan: 20,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, wrap, fontSize]);

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(fontSize));
  }, [fontSize]);

  const goTo = (index: number) => {
    if (matches.length === 0) return;
    const next = (index + matches.length) % matches.length;
    setCursor({ matches, index: next });
    virtualizer.scrollToIndex(floorIndex(rows.starts, matches[next]), { align: "center" });
  };

  // A new query lands on its first hit.
  useEffect(() => {
    if (matches.length) virtualizer.scrollToIndex(floorIndex(rows.starts, matches[0]), { align: "center" });
  }, [matches, rows, virtualizer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        const input = searchBox.current?.querySelector("input");
        input?.focus();
        input?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    } catch {
      toast("Couldn't copy — the browser refused");
    }
  };

  const isDiff = live?.grammar === "diff" || language === "diff";
  const digits = String(rows.lines).length;
  const gutter = `${digits + 2.5}ch`;
  const needleLength = needle.length;

  return (
    <ViewerFrame>
      <ViewerBar>
        {leading}
        {leading && <BarDivider />}
        <span className="etch hidden shrink-0 px-1.5 text-ink-soft sm:inline">{languageLabel(live?.grammar ?? language)}</span>
        <Readout>{rows.lines.toLocaleString()} {rows.lines === 1 ? "line" : "lines"}</Readout>
        {tooBig && <Readout className="hidden text-ink-faint md:inline">Highlighting off for size</Readout>}
        {notice && <Readout className="hidden text-ink-faint md:inline">{notice}</Readout>}
        <BarSpacer />
        <div ref={searchBox} className="contents">
          <SearchField value={query} onChange={setQuery} onEnter={(back) => goTo(current + (back ? -1 : 1))} placeholder="Find" />
        </div>
        {needle && (
          <>
            <Readout className={cn(matches.length === 0 && "text-breach")}>
              {matches.length === 0
                ? "0"
                : `${current + 1}/${matches.length >= MAX_MATCHES ? `${MAX_MATCHES.toLocaleString()}+` : matches.length.toLocaleString()}`}
            </Readout>
            <ToolButton icon={ChevronUp} label="Previous match (Shift+Enter)" disabled={!matches.length} onClick={() => goTo(current - 1)} />
            <ToolButton icon={ChevronDown} label="Next match (Enter)" disabled={!matches.length} onClick={() => goTo(current + 1)} />
          </>
        )}
        <BarDivider />
        <ToolButton icon={WrapText} label="Wrap lines" active={wrap} onClick={() => setWrap((value) => !value)} />
        <ToolButton icon={AArrowDown} label="Smaller text" disabled={fontSize <= 10} onClick={() => setFontSize((size) => size - 1)} />
        <ToolButton icon={AArrowUp} label="Larger text" disabled={fontSize >= 22} onClick={() => setFontSize((size) => size + 1)} />
        <ToolButton icon={Copy} label="Copy all" onClick={copyAll} />
      </ViewerBar>

      <div
        ref={scroller}
        tabIndex={0}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-panel font-mono text-ink outline-none [tab-size:4]"
        style={{ fontSize, lineHeight: `${lineHeight}px` }}
      >
        <div
          className="relative py-2"
          style={{
            height: virtualizer.getTotalSize() + 16,
            width: wrap ? "100%" : `calc(${rows.widest}ch + ${gutter} + 2rem)`,
            minWidth: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const start = rows.starts[item.index];
            const end = rows.ends[item.index];
            const line = rows.lineOf[item.index];
            const continued = item.index > 0 && rows.lineOf[item.index - 1] === line;
            const lineStart = rows.lineStarts[line];
            const content = text.slice(start, end);

            const marks: Mark[] = [];
            if (needleLength && matches.length) {
              for (let hit = Math.max(0, floorIndex(matches, start - needleLength)); hit < matches.length; hit++) {
                const at = matches[hit];
                if (at >= end) break;
                if (at + needleLength > start) marks.push([at - start, at - start + needleLength, hit === current]);
              }
            }

            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={wrap ? virtualizer.measureElement : undefined}
                className={cn("absolute left-0 flex w-full", isDiff && !continued && diffTint(content))}
                style={{ top: 8, transform: `translateY(${item.start}px)`, height: wrap ? undefined : lineHeight }}
              >
                <span
                  aria-hidden
                  className="sticky left-0 z-10 shrink-0 bg-panel pr-[1.5ch] text-right text-ink-faint select-none"
                  style={{ width: gutter, fontSize: "0.85em" }}
                >
                  {continued ? "·" : line + 1}
                </span>
                <span className={cn("min-w-0 flex-1 pr-4", wrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre")}>
                  {paint(content, live?.lines[line], start - lineStart, marks, theme)}
                  {content.length === 0 && "​"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ViewerFrame>
  );
}
