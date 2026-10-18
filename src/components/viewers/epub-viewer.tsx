"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import type { Location } from "epubjs/types/rendition";
import type { NavItem } from "epubjs/types/navigation";
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, List, X } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import {
  BarDivider,
  BarSpacer,
  LoadFailed,
  Readout,
  Segmented,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { useAppTheme, type AppTheme } from "@/lib/reading/theme";

type Flow = "paginated" | "scrolled";

const FONT_KEY = "reader-epub-font";
const FONT_MIN = 70;
const FONT_MAX = 200;

// Book stylesheets often pin text to black; in dark the theme wins over them.
const TEXT = "p, li, h1, h2, h3, h4, h5, h6, span, div, blockquote, td, th, dt, dd, figcaption, em, strong, i, b";
const THEMES: Record<AppTheme, object> = {
  light: {
    body: { color: "#151a18 !important", background: "#ffffff !important" },
    a: { color: "#0a7346 !important" },
  },
  dark: {
    body: { color: "#dfe5e2 !important", background: "#161b19 !important" },
    [TEXT]: { color: "inherit !important", "background-color": "transparent !important" },
    a: { color: "#35e08f !important" },
  },
};

function flatten(items: NavItem[], depth = 0): Array<NavItem & { depth: number }> {
  return items.flatMap((item) => [{ ...item, depth }, ...flatten(item.subitems ?? [], depth + 1)]);
}

const stripHash = (href: string) => href.split("#")[0];

function readFont() {
  const saved = Number(localStorage.getItem(FONT_KEY));
  return saved >= FONT_MIN && saved <= FONT_MAX ? saved : 100;
}

function Contents({ toc, activeHref, onPick, onClose }: {
  toc: Array<NavItem & { depth: number }>;
  activeHref?: string;
  onPick: (href: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close contents"
        onClick={onClose}
        className="absolute inset-0 z-10 bg-steel-950/30 sm:hidden"
      />
      <nav
        aria-label="Table of contents"
        className="absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] flex-col rounded-t-panel border-t border-line bg-surface shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.3)] sm:static sm:max-h-none sm:w-72 sm:shrink-0 sm:rounded-none sm:border-t-0 sm:border-r sm:shadow-none"
      >
        <div className="flex h-11 shrink-0 items-center justify-between px-4 sm:hidden">
          <span className="etch text-ink-faint">Contents</span>
          <ToolButton icon={X} label="Close contents" onClick={onClose} />
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 sm:pt-3">
          {toc.map((item, index) => {
            const active = activeHref !== undefined && stripHash(item.href) === activeHref;
            return (
              <li key={`${index}-${item.href}`}>
                <button
                  type="button"
                  onClick={() => onPick(item.href)}
                  aria-current={active || undefined}
                  className={cn(
                    "w-full rounded-lg py-1.5 pr-2 text-left text-[13px] leading-snug transition-colors",
                    active ? "bg-seal-wash font-medium text-seal-ink" : "text-ink-muted hover:bg-panel-hover hover:text-ink",
                  )}
                  style={{ paddingLeft: 12 + item.depth * 14 }}
                >
                  {item.label.trim()}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

function Reader({ book, storageKey }: { book: Book; storageKey: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const position = useRef<string | null>(null);
  const theme = useAppTheme();
  const themeRef = useRef(theme);
  const [flow, setFlow] = useState<Flow>("paginated");
  const [fontSize, setFontSize] = useState(readFont);
  const fontRef = useRef(fontSize);
  const [location, setLocation] = useState<Location>();
  const [indexed, setIndexed] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  const toc = useMemo(() => flatten(book.navigation?.toc ?? []), [book]);

  // Percentages need a pass over the whole book; it runs once the first page is up.
  useEffect(() => {
    let live = true;
    book.locations.generate(1600).then(() => live && setIndexed(true), () => undefined);
    return () => {
      live = false;
    };
  }, [book]);

  useEffect(() => {
    const element = viewport.current!;
    position.current ??= localStorage.getItem(storageKey);
    const view = book.renderTo(element, {
      width: "100%",
      height: "100%",
      flow,
      manager: flow === "scrolled" ? "continuous" : "default",
      spread: "auto",
      minSpreadWidth: 960,
      allowScriptedContent: false,
    });
    rendition.current = view;
    for (const [name, styles] of Object.entries(THEMES)) view.themes.register(name, styles);
    view.themes.select(themeRef.current);
    view.themes.fontSize(`${fontRef.current}%`);

    view.on("relocated", (next: Location) => {
      position.current = next.start.cfi;
      localStorage.setItem(storageKey, next.start.cfi);
      setLocation(next);
    });

    const turn = (forward: boolean) => (forward ? view.next() : view.prev());
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || target?.closest?.("input, textarea, select")) return;
      if (event.key === "ArrowRight" || (flow === "paginated" && event.key === "PageDown")) turn(true);
      else if (event.key === "ArrowLeft" || (flow === "paginated" && event.key === "PageUp")) turn(false);
      else return;
      event.preventDefault();
    };
    // Keys typed while focus is inside the book's frame arrive through the rendition.
    view.on("keydown", onKey);
    window.addEventListener("keydown", onKey);

    let touch: { x: number; y: number } | null = null;
    view.on("touchstart", (event: TouchEvent) => {
      touch = { x: event.changedTouches[0].screenX, y: event.changedTouches[0].screenY };
    });
    view.on("touchend", (event: TouchEvent) => {
      if (!touch || flow !== "paginated") return;
      const dx = event.changedTouches[0].screenX - touch.x;
      const dy = event.changedTouches[0].screenY - touch.y;
      touch = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0);
    });
    // A tap on the outer quarter of the page turns it, as on an e-reader.
    view.on("click", (event: MouseEvent) => {
      if (flow !== "paginated") return;
      const target = event.target as Element | null;
      if (target?.closest?.("a") || event.view?.getSelection()?.toString()) return;
      const frame = event.view?.frameElement?.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      if (!frame) return;
      const x = (frame.left + event.clientX - bounds.left) / bounds.width;
      if (x < 0.25) turn(false);
      else if (x > 0.75) turn(true);
    });

    // Opening or closing the contents panel resizes the page without resizing the window.
    let frame = 0;
    let displayed = false;
    const observer = new ResizeObserver(() => {
      if (!displayed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => (view.resize as (width?: number, height?: number) => void)());
    });
    observer.observe(element);

    view
      .display(position.current ?? undefined)
      .catch(() => view.display())
      .then(() => (displayed = true));

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      view.destroy();
      rendition.current = null;
    };
  }, [book, flow, storageKey]);

  useEffect(() => {
    themeRef.current = theme;
    rendition.current?.themes.select(theme);
  }, [theme]);

  const resizeText = (delta: number) => {
    const next = Math.min(FONT_MAX, Math.max(FONT_MIN, fontSize + delta));
    fontRef.current = next;
    setFontSize(next);
    rendition.current?.themes.fontSize(`${next}%`);
    localStorage.setItem(FONT_KEY, String(next));
  };

  const activeHref = location ? stripHash(location.start.href) : undefined;
  const percent = indexed && location ? Math.round(book.locations.percentageFromCfi(location.start.cfi) * 100) : null;

  const pick = (href: string) => {
    rendition.current?.display(href);
    if (window.matchMedia("(max-width: 639px)").matches) setTocOpen(false);
  };

  return (
    <>
      <ViewerBar>
        <ToolButton icon={List} label="Contents" active={tocOpen} disabled={toc.length === 0} onClick={() => setTocOpen((open) => !open)} />
        <Segmented
          value={flow}
          onChange={setFlow}
          options={[
            { value: "paginated", label: "Pages" },
            { value: "scrolled", label: "Scroll" },
          ]}
        />
        <BarSpacer />
        <ToolButton icon={AArrowDown} label="Smaller text" disabled={fontSize <= FONT_MIN} onClick={() => resizeText(-10)} />
        <Readout className="w-11 text-center">{fontSize}%</Readout>
        <ToolButton icon={AArrowUp} label="Larger text" disabled={fontSize >= FONT_MAX} onClick={() => resizeText(10)} />
        <BarDivider />
        <ToolButton icon={ChevronLeft} label="Previous page (←)" disabled={location?.atStart} onClick={() => rendition.current?.prev()} />
        {percent !== null && <Readout className="min-w-11 text-center">{percent}%</Readout>}
        <ToolButton icon={ChevronRight} label="Next page (→)" disabled={location?.atEnd} onClick={() => rendition.current?.next()} />
      </ViewerBar>
      <div className="relative flex min-h-0 flex-1">
        {tocOpen && <Contents toc={toc} activeHref={activeHref} onPick={pick} onClose={() => setTocOpen(false)} />}
        <div className={cn("min-w-0 flex-1 bg-sheet dark:bg-sunken", flow === "paginated" && "px-2 py-4 sm:px-8 sm:py-6")}>
          <div ref={viewport} className="size-full" />
        </div>
      </div>
    </>
  );
}

export default function EpubViewer({ doc }: ViewerProps) {
  const state = useLoad(
    async (signal) => {
      const { default: ePub } = await import("epubjs");
      const book = ePub(await doc.blob.arrayBuffer());
      signal.addEventListener("abort", () => book.destroy(), { once: true });
      await book.ready;
      await book.loaded.navigation;
      return book;
    },
    [doc.id],
  );
  return (
    <ViewerFrame>
      {state.status === "loading" ? (
        <ViewerStatus loading title="Opening book" />
      ) : state.status === "error" ? (
        <LoadFailed error={state.error} what="this book" />
      ) : (
        <Reader key={doc.id} book={state.value} storageKey={`reader-epub-position:${doc.name}:${doc.size}`} />
      )}
    </ViewerFrame>
  );
}
