"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, GalleryVertical, Presentation, RectangleHorizontal } from "lucide-react";
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
import { renderDeck, type Deck } from "@/lib/slides/render";

const SHADOW = "shadow-[0_1px_3px_rgb(0_0_0/0.12),0_12px_40px_-12px_rgb(0_0_0/0.25)]";

/**
 * Places a rendered slide element and scales it to its box: to the box's
 * width, or contained within it (letterboxed) for the stage.
 */
function ScaledSlide({ node, deck, fit, className }: {
  node: HTMLElement;
  deck: Deck;
  fit: "width" | "contain";
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const target = host.current!;
    target.append(node);
    return () => {
      if (node.parentNode === target) node.remove();
    };
  }, [node]);

  useEffect(() => {
    const element = box.current!;
    const observer = new ResizeObserver(() => {
      const byWidth = element.clientWidth / deck.width;
      setScale(fit === "width" ? byWidth : Math.min(byWidth, element.clientHeight / deck.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [deck, fit]);

  const slide = (
    <div
      ref={host}
      className="absolute top-0 left-0 origin-top-left"
      style={{ width: deck.width, height: deck.height, transform: `scale(${scale})` }}
    />
  );

  if (fit === "width") {
    return (
      <div
        ref={box}
        className={cn("relative w-full overflow-hidden bg-sheet", className)}
        style={{ aspectRatio: `${deck.width} / ${deck.height}` }}
      >
        {slide}
      </div>
    );
  }
  return (
    <div ref={box} className="absolute inset-0 flex items-center justify-center">
      <div
        className={cn("relative overflow-hidden bg-sheet", className)}
        style={{ width: deck.width * scale, height: deck.height * scale }}
      >
        {slide}
      </div>
    </div>
  );
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function Thumbnails({ deck, current, onSelect }: { deck: Deck; current: number; onSelect: (index: number) => void }) {
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rail.current?.children[current]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);
  return (
    <div
      ref={rail}
      className="flex h-24 shrink-0 gap-2 overflow-x-auto border-t border-line bg-surface p-2 sm:h-auto sm:w-44 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:border-t-0 sm:border-r sm:p-3"
    >
      {deck.thumbnails.map((thumbnail, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelect(index)}
          aria-label={`Slide ${index + 1}`}
          aria-current={index === current}
          className="group flex shrink-0 items-start gap-2 sm:w-full"
        >
          <span className="readout hidden w-4 shrink-0 pt-0.5 text-right text-[10px] text-ink-faint sm:block">
            {index + 1}
          </span>
          <ScaledSlide
            node={thumbnail}
            deck={deck}
            fit="width"
            className={cn(
              "pointer-events-none w-32 rounded-[3px] ring-1 transition-shadow sm:w-full",
              index === current ? "ring-2 ring-seal-ink" : "ring-line group-hover:ring-line-strong",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function SlideDeck({ deck }: { deck: Deck }) {
  const stage = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState(0);
  const [mode, setMode] = useState<"slides" | "scroll">("slides");
  const [presenting, setPresenting] = useState(false);
  const count = deck.slides.length;

  const go = useCallback((index: number) => setCurrent(Math.max(0, Math.min(count - 1, index))), [count]);
  const step = useCallback((delta: number) => setCurrent((index) => Math.max(0, Math.min(count - 1, index + delta))), [count]);

  useEffect(() => {
    const onChange = () => setPresenting(document.fullscreenElement === stage.current && !!stage.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (mode !== "slides") return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const delta = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, " ": 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[event.key];
      if (delta) step(event.shiftKey && event.key === " " ? -1 : delta);
      else if (event.key === "Home") go(0);
      else if (event.key === "End") go(count - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, step, go, count]);

  const present = () => {
    setMode("slides");
    stage.current?.requestFullscreen?.().catch(() => undefined);
  };

  const onPointerDown = (event: PointerEvent) => {
    swipe.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    else if (presenting && Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      // Presenting, a click advances; the left fifth of the screen goes back.
      const { left, width } = event.currentTarget.getBoundingClientRect();
      step(event.clientX - left < width / 5 ? -1 : 1);
    }
  };

  return (
    <>
      <ViewerBar>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "slides", label: "Slides", icon: RectangleHorizontal },
            { value: "scroll", label: "Scroll", icon: GalleryVertical },
          ]}
        />
        {deck.simplified && (
          <span className="ml-1 hidden shrink-0 text-[12px] text-ink-soft sm:inline" title="This deck couldn't be drawn faithfully, so its text and pictures are shown instead">
            Simplified view
          </span>
        )}
        <BarSpacer />
        {mode === "slides" && (
          <>
            <ToolButton icon={ChevronLeft} label="Previous slide (←)" disabled={current === 0} onClick={() => step(-1)} />
            <Readout className="min-w-14 text-center">
              {current + 1} / {count}
            </Readout>
            <ToolButton icon={ChevronRight} label="Next slide (→)" disabled={current === count - 1} onClick={() => step(1)} />
            <BarDivider />
          </>
        )}
        <ToolButton icon={Presentation} label="Present full screen" onClick={present}>
          <span className="hidden sm:inline">Present</span>
        </ToolButton>
      </ViewerBar>

      {mode === "scroll" ? (
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-sunken">
          <div className="mx-auto flex max-w-[72rem] flex-col gap-4 p-3 sm:gap-6 sm:p-6">
            {deck.slides.map((slide, index) => (
              <figure key={index}>
                <ScaledSlide node={slide} deck={deck} fit="width" className={SHADOW} />
                <figcaption className="readout mt-1.5 text-center text-[11px] text-ink-faint">{index + 1}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col-reverse sm:flex-row">
          {count > 1 && <Thumbnails deck={deck} current={current} onSelect={go} />}
          <div
            ref={stage}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipe.current = null)}
            className={cn(
              "relative min-h-0 min-w-0 flex-1 touch-pan-y bg-sunken select-none",
              presenting && "cursor-pointer bg-steel-950",
            )}
          >
            <div className={cn("absolute", presenting ? "inset-0" : "inset-3 sm:inset-6")}>
              <ScaledSlide node={deck.slides[current]} deck={deck} fit="contain" className={presenting ? undefined : SHADOW} />
            </div>
            {presenting && (
              <span className="readout pointer-events-none absolute right-4 bottom-3 text-[12px] text-steel-100/60">
                {current + 1} / {count}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function SlidesViewer({ doc }: ViewerProps) {
  const state = useLoad((signal) => renderDeck(doc.blob, signal), [doc.id]);
  return (
    <ViewerFrame>
      {state.status === "loading" ? (
        <ViewerStatus loading title="Drawing slides" />
      ) : state.status === "error" ? (
        <LoadFailed error={state.error} what="this presentation" />
      ) : (
        <SlideDeck key={doc.id} deck={state.value} />
      )}
    </ViewerFrame>
  );
}
