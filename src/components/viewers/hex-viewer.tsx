"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { BarSpacer, Readout, SearchField, ViewerBar, ViewerFrame, ViewerStatus } from "@/components/viewer-kit";

const ROW = 22;
/** Bytes are read from the blob in pages this size, and only the pages near the view are kept. */
const PAGE = 64 * 1024;
const KEEP = 48;
/**
 * Browsers cap an element's height around 16–33 million pixels. Past this the
 * scrollbar is scaled — a pixel of thumb covers many rows — and the wheel
 * steps rows directly so reading stays line by line.
 */
const MAX_SPACER = 8_000_000;

const hex = (value: number, width: number) => value.toString(16).toUpperCase().padStart(width, "0");

function parseOffset(input: string): number | undefined {
  const text = input.trim().replace(/_/g, "").toLowerCase();
  if (!text) return undefined;
  if (/^0x[0-9a-f]+$/.test(text)) return parseInt(text.slice(2), 16);
  if (/^\d+$/.test(text)) return parseInt(text, 10);
  if (/^[0-9a-f]+h?$/.test(text)) return parseInt(text.replace(/h$/, ""), 16);
  return undefined;
}

/**
 * Moves the scrollbar; in a scaled view, also swallows the scroll event that
 * fires, which would otherwise round the view to the scrollbar's coarse rows.
 */
function placeScrollbar(element: HTMLElement, scrollTop: number, ignore: { current: boolean }, scaled: boolean) {
  if (Math.abs(element.scrollTop - scrollTop) < 1) return;
  ignore.current = scaled;
  element.scrollTop = scrollTop;
}

function byteTone(value: number | undefined) {
  if (value === undefined || value === 0) return "text-ink-faint";
  if (value >= 0x20 && value < 0x7f) return "text-ink";
  return "text-ink-soft";
}

export default function HexViewer({ doc }: ViewerProps) {
  const { blob, size } = doc;
  const scroller = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const perRow = box.width && box.width < 640 ? 8 : 16;
  const totalRows = Math.max(1, Math.ceil(size / perRow));
  const visibleRows = Math.max(1, Math.floor(box.height / ROW));
  const natural = totalRows * ROW;
  const scaled = natural > MAX_SPACER;
  const spacer = Math.min(natural, MAX_SPACER);
  const lastTop = Math.max(0, totalRows - visibleRows);

  const [top, setTop] = useState(0);
  const [shift, setShift] = useState(0);
  const [selected, setSelected] = useState<number>();
  const [hover, setHover] = useState<number>();
  const [jump, setJump] = useState("");
  const [pages, setPages] = useState<ReadonlyMap<number, Uint8Array>>(new Map());
  const inflight = useRef(new Set<number>());
  const ignoreScroll = useRef(false);

  const firstRow = Math.min(top, lastTop);
  const topRef = useRef(0);
  useEffect(() => {
    topRef.current = firstRow;
  }, [firstRow]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setBox({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Read whichever pages the view needs and drop the far-away ones.
  const firstPage = Math.floor((firstRow * perRow) / PAGE);
  const lastPage = Math.floor(Math.min(size - 1, (firstRow + visibleRows + 1) * perRow) / PAGE);
  // The viewer is keyed on the doc, so the blob never changes under a read.
  useEffect(() => {
    const pending = inflight.current;
    for (let page = firstPage; page <= lastPage; page++) {
      if (pages.has(page) || pending.has(page)) continue;
      pending.add(page);
      blob
        .slice(page * PAGE, Math.min(size, (page + 1) * PAGE))
        .arrayBuffer()
        .then((buffer) => {
          pending.delete(page);
          setPages((current) => {
            const next = new Map(current);
            next.set(page, new Uint8Array(buffer));
            if (next.size > KEEP) {
              const far = [...next.keys()].sort((a, b) => Math.abs(b - page) - Math.abs(a - page));
              for (const key of far.slice(0, next.size - KEEP)) next.delete(key);
            }
            return next;
          });
        })
        .catch(() => pending.delete(page));
    }
  }, [blob, size, firstPage, lastPage, pages]);

  const byteAt = (offset: number) => pages.get(Math.floor(offset / PAGE))?.[offset % PAGE];

  const scrollTopFor = (row: number) => {
    const element = scroller.current;
    if (!element) return 0;
    if (!scaled) return row * ROW;
    return lastTop ? (row / lastTop) * (spacer - element.clientHeight) : 0;
  };

  const showRow = (row: number, force = false) => {
    const target = Math.max(0, Math.min(lastTop, row));
    if (!force && target >= firstRow && target < firstRow + visibleRows) return;
    const element = scroller.current;
    const next = force ? Math.max(0, Math.min(lastTop, row - Math.floor(visibleRows / 3))) : target < firstRow ? target : target - visibleRows + 1;
    setTop(next);
    setShift(0);
    if (element) placeScrollbar(element, scrollTopFor(next), ignoreScroll, scaled);
  };

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    if (ignoreScroll.current) {
      ignoreScroll.current = false;
      return;
    }
    if (!scaled) {
      setTop(Math.floor(element.scrollTop / ROW));
      setShift(element.scrollTop % ROW);
    } else {
      const range = spacer - element.clientHeight;
      setTop(Math.round((element.scrollTop / Math.max(1, range)) * lastTop));
      setShift(0);
    }
  };

  // In a scaled view the wheel steps rows, not scrollbar pixels.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !scaled) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rows = Math.round((event.deltaMode === 1 ? event.deltaY * ROW : event.deltaY) / ROW) || Math.sign(event.deltaY);
      const next = Math.max(0, Math.min(lastTop, topRef.current + rows));
      topRef.current = next;
      setTop(next);
      placeScrollbar(element, lastTop ? (next / lastTop) * (spacer - element.clientHeight) : 0, ignoreScroll, true);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [scaled, lastTop, spacer]);

  const select = (offset: number) => {
    const clamped = Math.max(0, Math.min(size - 1, offset));
    setSelected(clamped);
    showRow(Math.floor(clamped / perRow));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = selected ?? firstRow * perRow;
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -perRow,
      ArrowDown: perRow,
      PageUp: -perRow * visibleRows,
      PageDown: perRow * visibleRows,
    };
    if (event.key in steps) select(at + steps[event.key]);
    else if (event.key === "Home") select(0);
    else if (event.key === "End") select(size - 1);
    else return;
    event.preventDefault();
  };

  const offsetFromEvent = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-offset]");
    return target ? Number(target.dataset.offset) : undefined;
  };

  const goTo = () => {
    const offset = parseOffset(jump);
    if (offset === undefined) return;
    const clamped = Math.max(0, Math.min(size - 1, offset));
    setSelected(clamped);
    showRow(Math.floor(clamped / perRow), true);
    scroller.current?.focus();
  };

  if (size === 0) {
    return (
      <ViewerFrame>
        <ViewerStatus title="This file is empty" />
      </ViewerFrame>
    );
  }

  const width = Math.max(8, (size - 1).toString(16).length);
  const rows = Array.from({ length: Math.min(visibleRows + 2, totalRows - firstRow) }, (_, index) => firstRow + index);
  const columns = Array.from({ length: perRow }, (_, index) => index);

  const value = (offset: number, bytes: number) => {
    let result = 0;
    for (let index = bytes - 1; index >= 0; index--) {
      const byte = offset + index < size ? byteAt(offset + index) : undefined;
      if (byte === undefined) return undefined;
      result = result * 256 + byte;
    }
    return result;
  };
  const u8 = selected === undefined ? undefined : value(selected, 1);
  const u16 = selected === undefined ? undefined : value(selected, 2);
  const u32 = selected === undefined ? undefined : value(selected, 4);
  const show = (number: number | undefined) => (number === undefined ? "—" : number.toLocaleString());

  return (
    <ViewerFrame>
      <ViewerBar>
        {selected !== undefined && (
          <>
            <Readout className="text-ink">
              0x{hex(selected, width)} <span className="text-ink-faint">({selected.toLocaleString()})</span>
            </Readout>
            <Readout>
              <span className="etch mr-1.5 text-[9px] text-ink-faint">u8</span>
              {show(u8)}
            </Readout>
            <Readout>
              <span className="etch mr-1.5 text-[9px] text-ink-faint">u16 le</span>
              {show(u16)}
            </Readout>
            <Readout>
              <span className="etch mr-1.5 text-[9px] text-ink-faint">u32 le</span>
              {show(u32)}
            </Readout>
          </>
        )}
        <BarSpacer />
        <SearchField value={jump} onChange={setJump} onEnter={goTo} placeholder="Go to offset (0x… or decimal)" />
      </ViewerBar>

      <div className="flex shrink-0 border-b border-line bg-surface font-mono text-[11px] leading-6 text-ink-faint select-none">
        <div className="shrink-0 pr-4 pl-3 text-right" style={{ width: `${width + 3}ch` }}>
          offset
        </div>
        <div className="flex shrink-0 gap-[1ch]">
          {columns.map((column) => (
            <span key={column} className={cn("w-[2ch] text-center", column === 8 && "ml-[1ch]")}>
              {hex(column, 2)}
            </span>
          ))}
        </div>
        <div className="ml-[3ch] shrink-0">ascii</div>
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          const offset = offsetFromEvent(event);
          if (offset !== undefined) setSelected(offset);
        }}
        onMouseMove={(event) => setHover(offsetFromEvent(event))}
        onMouseLeave={() => setHover(undefined)}
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-panel font-mono text-[12.5px] outline-none"
      >
        <div style={{ height: spacer }}>
          <div className="sticky top-0 overflow-hidden" style={{ height: box.height }}>
            <div style={{ transform: `translateY(${-shift}px)` }}>
              {rows.map((row) => {
                const start = row * perRow;
                return (
                  <div key={row} className="flex items-center whitespace-pre" style={{ height: ROW }}>
                    <div
                      className={cn(
                        "shrink-0 pr-4 pl-3 text-right text-[11.5px] text-ink-faint select-none",
                        selected !== undefined && Math.floor(selected / perRow) === row && "text-ink-muted",
                      )}
                      style={{ width: `${width + 3}ch` }}
                    >
                      {hex(start, width)}
                    </div>
                    <div className="flex shrink-0 gap-[1ch]">
                      {columns.map((column) => {
                        const offset = start + column;
                        if (offset >= size) return <span key={column} className={cn("w-[2ch]", column === 8 && "ml-[1ch]")} />;
                        const byte = byteAt(offset);
                        return (
                          <span
                            key={column}
                            data-offset={offset}
                            className={cn(
                              "w-[2ch] cursor-default rounded-[3px] text-center",
                              column === 8 && "ml-[1ch]",
                              offset === selected ? "bg-fill text-on-fill" : offset === hover ? "bg-seal-wash text-seal-ink" : byteTone(byte),
                            )}
                          >
                            {byte === undefined ? "··" : hex(byte, 2)}
                          </span>
                        );
                      })}
                    </div>
                    <div className="ml-[3ch] flex shrink-0 border-l border-line pl-[1ch]">
                      {columns.map((column) => {
                        const offset = start + column;
                        if (offset >= size) return null;
                        const byte = byteAt(offset);
                        const printable = byte !== undefined && byte >= 0x20 && byte < 0x7f;
                        return (
                          <span
                            key={column}
                            data-offset={offset}
                            className={cn(
                              "w-[1ch] cursor-default text-center",
                              offset === selected ? "bg-fill text-on-fill" : offset === hover ? "bg-seal-wash text-seal-ink" : printable ? "text-ink" : "text-ink-faint",
                            )}
                          >
                            {printable ? String.fromCharCode(byte) : "·"}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

    </ViewerFrame>
  );
}
