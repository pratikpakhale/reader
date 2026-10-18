"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, ChevronRight, MoveHorizontal, MoveVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { BarDivider, BarSpacer, Readout, Segmented, ToolButton, useBlobUrl, ViewerBar, ViewerStatus } from "@/components/viewer-kit";

type Fit = "height" | "width";

const NO_PAGES: number[] = [];

/** How many pages either side of the current spread stay decoded. */
const KEEP_BEHIND = 2;
const KEEP_AHEAD = 4;

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

/** The cover stands alone, then pages pair up the way a printed book opens. */
function spreadsOf(count: number, paired: boolean): number[][] {
  if (!paired) return Array.from({ length: count }, (_, index) => [index]);
  const spreads: number[][] = count ? [[0]] : [];
  for (let index = 1; index < count; index += 2) spreads.push(index + 1 < count ? [index, index + 1] : [index]);
  return spreads;
}

/**
 * Page-by-page reading for archives that are mostly pictures — comics,
 * scans, photo dumps. Pages are pulled out of the archive only as they come
 * near, and let go once they're left behind.
 */
export function ArchiveGallery({
  pages,
  extract,
  leading,
}: {
  pages: string[];
  extract: (path: string) => Promise<Blob>;
  leading: ReactNode;
}) {
  const wide = useWide();
  const [fit, setFit] = useState<Fit>("height");
  const [spreadWanted, setSpreadWanted] = useState(true);
  const paired = wide && spreadWanted && fit === "height";
  const spreads = useMemo(() => spreadsOf(pages.length, paired), [pages.length, paired]);
  const [page, setPage] = useState(0);
  const spreadIndex = Math.max(0, spreads.findIndex((spread) => spread.includes(page)));
  const spread = spreads[spreadIndex] ?? NO_PAGES;

  // Blobs rather than URLs: each <Page> owns its object URL through useBlobUrl.
  const [blobs, setBlobs] = useState<Map<number, Blob>>(() => new Map());
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const loading = useRef(new Set<number>());
  const kept = useRef({ low: 0, high: 0 });
  const scroller = useRef<HTMLDivElement>(null);

  // Decode the neighbourhood; each page that arrives evicts what fell out of it.
  useEffect(() => {
    const low = Math.max(0, spreads[spreadIndex - KEEP_BEHIND]?.[0] ?? 0);
    const high = Math.min(pages.length - 1, spreads[spreadIndex + KEEP_AHEAD]?.at(-1) ?? pages.length - 1);
    kept.current = { low, high };
    let cancelled = false;
    // Current spread first, then forward, then back.
    const order = [...spread];
    for (let index = (spread.at(-1) ?? 0) + 1; index <= high; index += 1) order.push(index);
    for (let index = (spread[0] ?? 0) - 1; index >= low; index -= 1) order.push(index);
    void (async () => {
      for (const index of order) {
        if (cancelled) return;
        if (loading.current.has(index) || blobs.has(index) || failed.has(index)) continue;
        loading.current.add(index);
        try {
          const blob = await extract(pages[index]);
          setBlobs((current) => {
            // The window as it is now, not as it was when this load began.
            const { low: from, high: to } = kept.current;
            const next = new Map([...current].filter(([held]) => held >= from && held <= to));
            if (index >= from && index <= to) next.set(index, blob);
            return next;
          });
        } catch {
          setFailed((current) => new Set(current).add(index));
        } finally {
          loading.current.delete(index);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spread, spreadIndex, spreads, pages, extract, blobs, failed]);

  const go = useCallback(
    (delta: number) => {
      const target = spreads[Math.min(spreads.length - 1, Math.max(0, spreadIndex + delta))];
      if (!target) return;
      setPage(target[0]);
      scroller.current?.scrollTo({ top: 0 });
    },
    [spreads, spreadIndex],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowRight" || event.key === "PageDown" || (event.key === " " && !event.shiftKey)) {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
        event.preventDefault();
        go(-1);
      } else if (event.key === "Home") {
        setPage(0);
      } else if (event.key === "End") {
        setPage(pages.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, pages.length]);

  // A horizontal swipe turns the page; anything mostly vertical is a scroll.
  const swipe = useRef<{ x: number; y: number } | null>(null);

  if (!pages.length) return <ViewerStatus title="No pictures in this archive" />;

  const label =
    spread.length > 1 ? `${spread[0] + 1}–${spread[1] + 1} / ${pages.length}` : `${(spread[0] ?? 0) + 1} / ${pages.length}`;

  return (
    <>
      <ViewerBar>
        {leading}
        <BarSpacer />
        <ToolButton icon={ChevronLeft} label="Previous page (←)" disabled={spreadIndex === 0} onClick={() => go(-1)} />
        <Readout className="min-w-16 text-center">{label}</Readout>
        <ToolButton
          icon={ChevronRight}
          label="Next page (→)"
          disabled={spreadIndex >= spreads.length - 1}
          onClick={() => go(1)}
        />
        <BarDivider />
        <Segmented
          value={fit}
          onChange={setFit}
          options={[
            { value: "height", label: "Fit height", icon: MoveVertical },
            { value: "width", label: "Fit width", icon: MoveHorizontal },
          ]}
        />
        {wide && (
          <ToolButton
            icon={BookOpen}
            label="Two-page spread"
            active={paired}
            disabled={fit !== "height"}
            onClick={() => setSpreadWanted((value) => !value)}
          />
        )}
      </ViewerBar>
      <div
        ref={scroller}
        className={cn(
          "relative min-h-0 flex-1 touch-pan-y bg-sunken select-none",
          fit === "width" ? "overflow-y-auto" : "overflow-hidden",
        )}
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          else if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && event.pointerType !== "mouse") {
            // A tap on either edge pages, as in every comic reader.
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width;
            if (x < 0.3) go(-1);
            else if (x > 0.7) go(1);
          }
        }}
      >
        <div
          className={cn(
            "flex justify-center gap-0.5",
            fit === "height" ? "h-full items-center p-3 sm:p-5" : "mx-auto max-w-5xl items-start",
          )}
        >
          {spread.map((index) => {
            const blob = blobs.get(index);
            return blob ? (
              <Page key={index} blob={blob} index={index} fit={fit} half={spread.length > 1} />
            ) : (
              <div key={index} className="flex h-full min-h-60 flex-1 items-center justify-center">
                <ViewerStatus
                  loading={!failed.has(index)}
                  tone={failed.has(index) ? "error" : "neutral"}
                  title={failed.has(index) ? `Page ${index + 1} couldn't be read` : `Page ${index + 1}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Page({ blob, index, fit, half }: { blob: Blob; index: number; fit: Fit; half: boolean }) {
  const url = useBlobUrl(blob);
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a blob: URL, not an asset next/image could optimise
    <img
      src={url}
      alt={`Page ${index + 1}`}
      draggable={false}
      className={cn(
        "min-w-0 bg-sheet object-contain shadow-[0_1px_3px_rgb(0_0_0/0.12),0_12px_40px_-12px_rgb(0_0_0/0.25)]",
        fit === "height" ? (half ? "max-h-full max-w-[50%]" : "max-h-full max-w-full") : "w-full",
      )}
    />
  );
}
