"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ChevronUp, Copy, Link2 } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { extensionOf } from "@/lib/formats/registry";
import { parseJson, type ParsedJson } from "@/lib/json/parse";
import { flatten, isContainer, MAX_HITS, search, type JsonRow, type OpenState } from "@/lib/json/tree";
import {
  BarDivider,
  BarSpacer,
  LoadFailed,
  readText,
  Readout,
  SearchField,
  Segmented,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { CodeView } from "./code-view";

const ROW = 26;
const INDENT = 16;
/** Pretty-printing past this would double a big file in memory for little gain; Raw shows it as written. */
const PRETTY_LIMIT = 10_000_000;
const TREE_LIMIT = 512 * 1024 * 1024;

type Mode = "tree" | "raw";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${what}`);
  } catch {
    toast("Couldn't copy — the browser refused");
  }
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** A one-line glimpse of a value, the way a console prints a collapsed object. */
function glimpse(value: unknown, budget = 80): string {
  if (typeof value === "string") return JSON.stringify(value.length > budget ? `${value.slice(0, budget)}…` : value);
  if (!isContainer(value)) return String(value);
  const isArray = Array.isArray(value);
  const parts: string[] = [];
  let used = 0;
  const entries = isArray ? value.slice(0, 20).map((item, index) => [index, item] as const) : Object.entries(value).slice(0, 20);
  for (const [key, item] of entries) {
    const shown = isContainer(item) ? (Array.isArray(item) ? "[…]" : "{…}") : glimpse(item, 24);
    const part = isArray ? shown : `${key}: ${shown}`;
    if (used + part.length > budget) {
      parts.push("…");
      break;
    }
    parts.push(part);
    used += part.length + 2;
  }
  const size = isArray ? value.length : Object.keys(value).length;
  if (parts.length < size && parts.at(-1) !== "…") parts.push("…");
  return isArray ? `[${parts.join(", ")}]` : `{${parts.join(", ")}}`;
}

function Value({ value }: { value: unknown }) {
  if (typeof value === "string") return <span className="text-seal-ink">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="text-ink">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="font-medium text-ink-muted">{String(value)}</span>;
  return <span className="text-ink-faint italic">null</span>;
}

function Row({
  row,
  selected,
  hit,
  current,
  onClick,
}: {
  row: JsonRow;
  selected: boolean;
  hit: boolean;
  current: boolean;
  onClick: () => void;
}) {
  const container = row.count !== undefined;
  const isArray = Array.isArray(row.value);
  const Chevron = row.open ? ChevronDown : ChevronRight;
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex h-full cursor-default items-center gap-1 pr-4 whitespace-nowrap",
        selected ? "bg-seal-wash" : "hover:bg-panel-hover",
        hit && !selected && "bg-sunken",
        current && "ring-1 ring-seal-ink ring-inset",
      )}
      style={{ paddingLeft: 8 + row.depth * INDENT }}
    >
      <span className="flex w-4 shrink-0 justify-center text-ink-faint">
        {container && <Chevron className="size-3.5" strokeWidth={1.75} />}
      </span>
      {row.key !== undefined && (
        <>
          <span className={typeof row.key === "number" ? "text-ink-faint" : "text-ink-muted"}>{row.key}</span>
          <span className="text-ink-faint">:</span>
        </>
      )}
      {container ? (
        row.open ? (
          <span className="text-ink-faint">
            {isArray ? "[" : "{"}
            <span className="etch ml-1.5 text-[9px]">{plural(row.count!, isArray ? "item" : "key", isArray ? "items" : "keys")}</span>
          </span>
        ) : (
          <span className="min-w-0 truncate text-ink-soft">
            {glimpse(row.value)}
            <span className="etch ml-2 text-[9px] text-ink-faint">{row.count!.toLocaleString()}</span>
          </span>
        )
      ) : (
        <span className="min-w-0 truncate">
          <Value value={row.value} />
        </span>
      )}
    </div>
  );
}

function Tree({ parsed, text, size }: { parsed: ParsedJson; text: string; size: number }) {
  const { value, kind } = parsed;
  const scroller = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("tree");
  const [open, setOpen] = useState<OpenState>(() => ({ depth: size < 1_000_000 ? 2 : 1, flipped: new Set() }));
  const [query, setQuery] = useState("");
  const [needle, setNeedle] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selected, setSelected] = useState<string>();

  useEffect(() => () => clearTimeout(debounce.current), []);
  const onQuery = (next: string) => {
    setQuery(next);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setNeedle(next.trim()), next ? 220 : 0);
  };

  const found = useMemo(() => (needle ? search(value, needle) : null), [value, needle]);
  const { rows, truncated } = useMemo(
    () => flatten(value, found ? { ...open, forced: found.ancestors } : open),
    [value, open, found],
  );
  const hitSet = useMemo(() => new Set(found?.hits), [found]);
  const [cursor, setCursor] = useState({ found, index: 0 });
  const current = cursor.found === found ? cursor.index : 0;
  const currentPath = found?.hits[current];

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 16,
  });

  const reveal = (path: string | undefined) => {
    if (!path) return;
    const index = rows.findIndex((row) => row.path === path);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  };

  useEffect(() => {
    if (!currentPath) return;
    const index = rows.findIndex((row) => row.path === currentPath);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "center" });
  }, [currentPath, rows, virtualizer]);

  const step = (delta: number) => {
    if (!found?.hits.length) return;
    const index = (current + delta + found.hits.length) % found.hits.length;
    setCursor({ found, index });
    setSelected(found.hits[index]);
  };

  const toggle = (row: JsonRow) => {
    if (row.count === undefined) return;
    setOpen((state) => {
      const flipped = new Set(state.flipped);
      if (flipped.has(row.path)) flipped.delete(row.path);
      else flipped.add(row.path);
      return { ...state, flipped };
    });
  };

  const selectedRow = useMemo(() => rows.find((row) => row.path === selected), [rows, selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = rows.findIndex((row) => row.path === selected);
    const move = (to: number) => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, to))];
      if (!target) return;
      setSelected(target.path);
      reveal(target.path);
    };
    const row = rows[index];
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "ArrowRight":
        if (row?.count !== undefined && !row.open) toggle(row);
        else move(index + 1);
        break;
      case "ArrowLeft":
        if (row?.count !== undefined && row.open) toggle(row);
        else if (row?.parent) move(rows.findIndex((candidate) => candidate.path === row.parent));
        break;
      case "Enter":
        if (row) toggle(row);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const raw = useMemo(
    () => (mode === "raw" ? (kind === "json" && text.length < PRETTY_LIMIT ? JSON.stringify(value, null, 2) : text) : ""),
    [mode, kind, text, value],
  );

  const modeToggle = (
    <Segmented
      value={mode}
      onChange={setMode}
      options={[
        { value: "tree", label: "Tree" },
        { value: "raw", label: "Raw" },
      ]}
    />
  );

  if (mode === "raw") return <CodeView text={raw} language={kind === "lines" ? "jsonl" : "json"} leading={modeToggle} />;

  const rootSummary = isContainer(value)
    ? Array.isArray(value)
      ? plural(value.length, kind === "lines" ? "record" : "item", kind === "lines" ? "records" : "items")
      : plural(Object.keys(value).length, "key", "keys")
    : typeof value;

  return (
    <ViewerFrame>
      <ViewerBar>
        {modeToggle}
        <Readout className="hidden sm:inline">{rootSummary}</Readout>
        {kind === "lines" && <span className="etch hidden shrink-0 px-1 text-ink-faint md:inline">JSON Lines</span>}
        {kind === "lenient" && (
          <span className="etch hidden shrink-0 px-1 text-ink-faint md:inline" title="Comments and trailing commas were set aside">
            Lenient
          </span>
        )}
        <BarSpacer />
        <SearchField value={query} onChange={onQuery} onEnter={(back) => step(back ? -1 : 1)} placeholder="Find keys or values" />
        {found && (
          <>
            <Readout className={cn(found.hits.length === 0 && "text-breach")}>
              {found.hits.length === 0
                ? "0"
                : `${current + 1}/${found.capped ? `${MAX_HITS.toLocaleString()}+` : found.hits.length.toLocaleString()}`}
            </Readout>
            <ToolButton icon={ChevronUp} label="Previous match (Shift+Enter)" disabled={!found.hits.length} onClick={() => step(-1)} />
            <ToolButton icon={ChevronDown} label="Next match (Enter)" disabled={!found.hits.length} onClick={() => step(1)} />
          </>
        )}
        <BarDivider />
        <ToolButton icon={ChevronsUpDown} label="Expand all" onClick={() => setOpen({ depth: Infinity, flipped: new Set() })} />
        <ToolButton icon={ChevronsDownUp} label="Collapse all" onClick={() => setOpen({ depth: 1, flipped: new Set() })} />
      </ViewerBar>

      <div
        ref={scroller}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-panel font-mono text-[12.5px] outline-none"
      >
        <div className="relative min-w-full" style={{ height: virtualizer.getTotalSize() + 8 }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div key={item.key} className="absolute top-1 left-0 w-full" style={{ height: ROW, transform: `translateY(${item.start}px)` }}>
                <Row
                  row={row}
                  selected={row.path === selected}
                  hit={hitSet.has(row.path)}
                  current={row.path === currentPath}
                  onClick={() => {
                    setSelected(row.path);
                    toggle(row);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line bg-surface pr-1.5 pl-3">
        {selectedRow ? (
          <>
            <span className="readout min-w-0 flex-1 truncate text-[12px] text-ink-muted" title={selectedRow.path}>
              {selectedRow.path}
            </span>
            <ToolButton icon={Link2} label="Copy path" onClick={() => copy(selectedRow.path, "path")} />
            <ToolButton
              icon={Copy}
              label="Copy value"
              onClick={() =>
                copy(
                  typeof selectedRow.value === "string" ? selectedRow.value : JSON.stringify(selectedRow.value, null, 2),
                  "value",
                )
              }
            />
          </>
        ) : (
          <span className="flex-1 truncate text-[12px] text-ink-faint">
            {truncated ? "Showing the first 1,000,000 rows — collapse some to see the rest" : "Select a row to copy its path or value"}
          </span>
        )}
      </div>
    </ViewerFrame>
  );
}

export default function JsonViewer({ doc }: ViewerProps) {
  const loaded = useLoad(async () => {
    if (doc.blob.size > TREE_LIMIT) throw new Error("Too large to build a tree from in a browser tab — try viewing it as text.");
    const text = await readText(doc.blob);
    const lines = ["jsonl", "ndjson"].includes(extensionOf(doc.name));
    try {
      return { text, parsed: parseJson(text, lines) };
    } catch (error) {
      return { text, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [doc.id]);

  if (loaded.status === "loading") {
    return (
      <ViewerFrame>
        <ViewerStatus loading title="Parsing" />
      </ViewerFrame>
    );
  }
  if (loaded.status === "error") {
    return (
      <ViewerFrame>
        <LoadFailed error={loaded.error} />
      </ViewerFrame>
    );
  }
  const { text, parsed, error } = loaded.value;
  if (!parsed) {
    return (
      <CodeView
        text={text}
        language="json"
        leading={
          <span className="readout max-w-[50vw] shrink-0 truncate px-1.5 text-[12px] text-breach" title={error?.message}>
            Not valid JSON — {error?.message}
          </span>
        }
      />
    );
  }
  return <Tree parsed={parsed} text={text} size={doc.size} />;
}
