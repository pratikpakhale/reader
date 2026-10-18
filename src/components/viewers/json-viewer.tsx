"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ChevronUp, Copy, Link2, type LucideIcon } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { extensionOf } from "@/lib/formats/registry";
import { parseJson, type ParsedJson } from "@/lib/json/parse";
import { flatten, isContainer, MAX_HITS, MAX_ROWS, search, sizeOf, type JsonRow, type OpenState } from "@/lib/json/tree";
import {
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
  if (parts.length < sizeOf(value) && parts.at(-1) !== "…") parts.push("…");
  return isArray ? `[${parts.join(", ")}]` : `{${parts.join(", ")}}`;
}

function Value({ value }: { value: unknown }) {
  if (typeof value === "string") return <span className="text-seal-ink">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="text-ink">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="font-medium text-ink-muted">{String(value)}</span>;
  return <span className="text-ink-faint italic">null</span>;
}

function CopyButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-sunken hover:text-ink"
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
    </button>
  );
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
            <span className="etch ml-1.5 text-[9px]">
              {row.count!.toLocaleString()} {isArray ? "item" : "key"}
              {row.count === 1 ? "" : "s"}
            </span>
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
      {selected && (
        <span className="sticky right-1 ml-auto flex shrink-0 gap-0.5 pl-2">
          <CopyButton icon={Link2} label="Copy path" onClick={() => copy(row.path, "path")} />
          <CopyButton
            icon={Copy}
            label="Copy value"
            onClick={() => copy(typeof row.value === "string" ? row.value : JSON.stringify(row.value, null, 2), "value")}
          />
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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = rows.findIndex((row) => row.path === selected);
    const move = (to: number) => {
      const target = Math.max(0, Math.min(rows.length - 1, to));
      if (!rows[target]) return;
      setSelected(rows[target].path);
      virtualizer.scrollToIndex(target, { align: "auto" });
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

  return (
    <ViewerFrame>
      <ViewerBar>
        {modeToggle}
        {truncated && <Readout className="text-ink-faint">First {MAX_ROWS.toLocaleString()} rows</Readout>}
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
