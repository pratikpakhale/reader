"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Font } from "fontkit";
import { Grid3x3, Type, X } from "lucide-react";
import type { Doc, ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { describe, displayName, extractFromCollection, isCollection, type FontFacts } from "@/lib/fonts/inspect";
import {
  BarSpacer,
  LoadFailed,
  SearchField,
  Segmented,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";

type Tab = "specimen" | "glyphs";

const PANGRAM = "Sphinx of black quartz, judge my vow.";
const CELL = 76;

function hex(codePoint: number) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

async function parseFont(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fontkit = await import("fontkit");
  // fontkit's types say Buffer; its browser build reads any Uint8Array.
  const parsed = fontkit.create(bytes as unknown as Parameters<typeof fontkit.create>[0]);
  return isCollection(parsed)
    ? { bytes, fonts: parsed.fonts, collection: true }
    : { bytes, fonts: [parsed], collection: false };
}

export default function FontViewer({ doc }: ViewerProps) {
  const state = useLoad(() => parseFont(doc.blob), [doc.id]);
  return (
    <ViewerFrame>
      {state.status === "loading" && <ViewerStatus loading title="Reading font" />}
      {state.status === "error" && <LoadFailed error={state.error} what="this font" />}
      {state.status === "ready" && <FontBody doc={doc} {...state.value} />}
    </ViewerFrame>
  );
}

function FontBody({ doc, bytes, fonts, collection }: { doc: Doc; bytes: Uint8Array; fonts: Font[]; collection: boolean }) {
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<Tab>("specimen");
  const [query, setQuery] = useState("");
  const font = fonts[index];
  const facts = useMemo(() => describe(font), [font]);

  // The face is registered for as long as this load lives; switching faces
  // or closing the doc takes it back out of document.fonts.
  const face = useLoad(
    async (signal) => {
      const family = `reader-font-${doc.id}-${index}`;
      const data = collection ? extractFromCollection(bytes, index) : bytes;
      const loaded = await new FontFace(family, data as Uint8Array<ArrayBuffer>).load();
      if (!signal.aborted) {
        document.fonts.add(loaded);
        signal.addEventListener("abort", () => document.fonts.delete(loaded), { once: true });
      }
      return family;
    },
    [doc.id, index],
  );

  return (
    <>
      <ViewerBar>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "specimen", label: "Specimen", icon: Type },
            { value: "glyphs", label: "Glyphs", icon: Grid3x3 },
          ]}
        />
        {collection && (
          <select
            value={index}
            onChange={(event) => setIndex(Number(event.target.value))}
            aria-label="Font in collection"
            className="h-8 max-w-48 shrink-0 truncate rounded-lg border border-line bg-panel px-3 text-[13px] text-ink outline-none focus:border-ink-soft"
          >
            {fonts.map((candidate, position) => (
              <option key={position} value={position}>
                {displayName(candidate) || `Font ${position + 1}`}
              </option>
            ))}
          </select>
        )}
        {tab === "glyphs" && <SearchField value={query} onChange={setQuery} placeholder="Find a glyph" />}
      </ViewerBar>
      {face.status === "loading" && <ViewerStatus loading title="Loading font" />}
      {face.status === "error" && <LoadFailed error={face.error} what="this font in the browser" />}
      {face.status === "ready" &&
        (tab === "specimen" ? (
          <Specimen key={index} family={face.value} facts={facts} />
        ) : (
          <Glyphs key={index} family={face.value} font={font} facts={facts} query={query} />
        ))}
    </>
  );
}

/** A sample the font can actually draw: the pangram, or a run of its own main script. */
function defaultSample(font: FontFacts) {
  const has = new Set(font.codePoints);
  if ([...PANGRAM].every((char) => char === " " || has.has(char.codePointAt(0)!))) return PANGRAM;
  const letters = font.codePoints.filter((codePoint) => /\p{L}/u.test(String.fromCodePoint(codePoint)));
  return String.fromCodePoint(...(letters.length ? letters : font.codePoints).slice(0, 36));
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2.5">
      <span className="etch w-14 shrink-0 truncate text-ink-faint" title={label}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-5 w-32 min-w-0 flex-1 accent-[var(--ink)] sm:w-40 sm:flex-none"
      />
      <span className="readout w-14 shrink-0 text-[12px] text-ink-muted">
        {Math.round(value * 10) / 10}
        {unit}
      </span>
    </label>
  );
}

function Specimen({ family, facts }: { family: string; facts: FontFacts }) {
  const [sample, setSample] = useState(() => defaultSample(facts));
  const [size, setSize] = useState(64);
  const [axes, setAxes] = useState<Record<string, number>>(() =>
    Object.fromEntries(facts.axes.map((axis) => [axis.tag, axis.default])),
  );

  const has = useMemo(() => new Set(facts.codePoints), [facts]);
  const only = (chars: string) => [...chars].filter((char) => has.has(char.codePointAt(0)!)).join("");
  const sets = [
    { label: "Uppercase", text: only("ABCDEFGHIJKLMNOPQRSTUVWXYZ") },
    { label: "Lowercase", text: only("abcdefghijklmnopqrstuvwxyz") },
    { label: "Figures & marks", text: only("0123456789 .,:;!?&@#%*()[]{}<>/\\+-=–—'\"“”‘’$€£¥") },
  ].filter((set) => set.text.trim());

  const style: CSSProperties = {
    fontFamily: `"${family}", var(--font-sans)`,
    fontVariationSettings: facts.axes.length
      ? facts.axes.map((axis) => `"${axis.tag}" ${axes[axis.tag]}`).join(", ")
      : undefined,
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-sheet text-ink">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur">
        <Slider label="Size" value={size} min={12} max={200} onChange={setSize} unit="px" />
        {facts.axes.map((axis) => (
          <Slider
            key={axis.tag}
            label={axis.name || axis.tag}
            value={axes[axis.tag]}
            min={axis.min}
            max={axis.max}
            step={axis.max - axis.min > 10 ? 1 : 0.01}
            onChange={(value) => setAxes((current) => ({ ...current, [axis.tag]: value }))}
          />
        ))}
      </div>

      <div className="px-4 py-6 sm:px-8">
        <textarea
          value={sample}
          onChange={(event) => setSample(event.target.value)}
          aria-label="Sample text"
          spellCheck={false}
          rows={2}
          style={{ ...style, fontSize: size }}
          className="block w-full resize-none overflow-hidden bg-transparent leading-[1.15] break-words text-ink outline-none [field-sizing:content]"
        />
      </div>

      {sets.length > 0 && (
        <div className="grid gap-5 border-t border-line px-4 py-6 sm:px-8">
          {sets.map((set) => (
            <div key={set.label}>
              <p className="etch mb-2 text-ink-faint">{set.label}</p>
              <p style={{ ...style, fontSize: 32 }} className="leading-snug break-all">
                {set.text}
              </p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function glyphName(font: Font, codePoint: number) {
  try {
    return font.glyphForCodePoint(codePoint).name ?? "";
  } catch {
    return "";
  }
}

function Glyphs({ family, font, facts, query }: { family: string; font: Font; facts: FontFacts; query: string }) {
  const [scroller, width] = useWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<number | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim();
    if (!needle) return facts.codePoints;
    const chars = [...needle];
    if (chars.length === 1) return facts.codePoints.filter((codePoint) => codePoint === chars[0].codePointAt(0));
    const code = /^(?:u\+|0x)?([0-9a-f]{2,6})$/i.exec(needle);
    const prefix = code?.[1].toUpperCase();
    const lower = needle.toLowerCase();
    return facts.codePoints.filter(
      (codePoint) =>
        (prefix && codePoint.toString(16).toUpperCase().padStart(4, "0").startsWith(prefix)) ||
        glyphName(font, codePoint).toLowerCase().includes(lower),
    );
  }, [facts.codePoints, font, query]);

  const columns = Math.max(3, Math.floor(width / CELL));
  const rowCount = Math.ceil(visible.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scroller.current,
    estimateSize: () => CELL,
    overscan: 6,
  });

  const fontStyle = { fontFamily: `"${family}", var(--font-sans)` };
  const glyph = selected !== null ? font.glyphForCodePoint(selected) : null;

  return (
    <div className="relative flex min-h-0 flex-1">
      <div ref={scroller} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-panel">
        {visible.length === 0 ? (
          <ViewerStatus title="No glyphs match" />
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => (
              <div key={row.key} className="absolute left-0 flex w-full" style={{ top: row.start, height: CELL }}>
                {visible.slice(row.index * columns, row.index * columns + columns).map((codePoint) => (
                  <button
                    key={codePoint}
                    type="button"
                    onClick={() => setSelected(codePoint)}
                    aria-pressed={selected === codePoint}
                    title={hex(codePoint)}
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-1 border-r border-b border-line/60 transition-colors hover:bg-panel-hover",
                      selected === codePoint && "bg-seal-wash",
                    )}
                    style={{ width: `${100 / columns}%` }}
                  >
                    <span style={fontStyle} className="text-[28px] leading-none text-ink">
                      {String.fromCodePoint(codePoint)}
                    </span>
                    <span className="readout text-[9px] text-ink-faint">{hex(codePoint).slice(2)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected !== null && glyph && (
        <aside className="animate-in absolute inset-x-0 bottom-0 z-10 flex max-h-[70%] flex-col border-t border-line bg-surface shadow-xl md:static md:max-h-none md:w-72 md:border-t-0 md:border-l md:shadow-none">
          <div className="flex items-center gap-2 px-3 pt-2">
            <span className="readout text-[12px] text-ink">{hex(selected)}</span>
            <BarSpacer />
            <ToolButton icon={X} label="Close" onClick={() => setSelected(null)} />
          </div>
          <div className="flex min-h-40 flex-1 items-center justify-center bg-sheet md:min-h-64 md:flex-none">
            <span style={fontStyle} className="text-[140px] leading-none text-ink md:text-[180px]">
              {String.fromCodePoint(selected)}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-[12px]">
            <dt className="etch self-center text-ink-faint">Name</dt>
            <dd className="readout truncate text-ink">{glyph.name || "—"}</dd>
            <dt className="etch self-center text-ink-faint">Character</dt>
            <dd className="readout text-ink select-all">{String.fromCodePoint(selected)}</dd>
          </dl>
        </aside>
      )}
    </div>
  );
}
