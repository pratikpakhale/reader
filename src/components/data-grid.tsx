"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";

export type Cell = string | number | boolean | bigint | Date | null | undefined | Uint8Array | object;

const ROW_HEIGHT = 30;
const MIN_WIDTH = 64;
const MAX_WIDTH = 360;

export function cellText(value: Cell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return isNaN(value.getTime()) ? "Invalid date" : value.toISOString();
  if (value instanceof Uint8Array) return `‹${value.length} bytes›`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isNumeric(value: Cell) {
  return typeof value === "number" || typeof value === "bigint";
}

function compare(a: Cell, b: Cell) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (isNumeric(a) && isNumeric(b)) return a < b ? -1 : 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const na = Number(a);
  const nb = Number(b);
  if (typeof a === "string" && typeof b === "string" && a.trim() !== "" && b.trim() !== "" && !isNaN(na) && !isNaN(nb)) {
    return na - nb;
  }
  return cellText(a).localeCompare(cellText(b), undefined, { numeric: true });
}

/**
 * The one table every tabular viewer draws with — CSV, spreadsheets, SQLite,
 * Parquet. Rows and columns are both virtualised, so a million-row file
 * scrolls like a ten-row one.
 */
export function DataGrid({
  columns,
  rows,
  columnTypes,
  sortable = true,
  filter = "",
  rowLabel,
}: {
  columns: string[];
  rows: Cell[][];
  /** Shown under each header, e.g. a SQL or Parquet type. */
  columnTypes?: string[];
  sortable?: boolean;
  /** Rows not containing this text (case-insensitive) are hidden. */
  filter?: string;
  /** The label in the gutter; defaults to the 1-based row number. */
  rowLabel?: (index: number) => string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);
  const [selected, setSelected] = useState<{ row: number; column: number } | null>(null);

  const order = useMemo(() => {
    let indices = rows.map((_, index) => index);
    const needle = filter.trim().toLowerCase();
    if (needle) {
      indices = indices.filter((index) =>
        rows[index].some((cell) => cellText(cell).toLowerCase().includes(needle)),
      );
    }
    if (sort) {
      indices.sort((a, b) => {
        const result = compare(rows[a][sort.column], rows[b][sort.column]);
        return sort.descending ? -result : result;
      });
    }
    return indices;
  }, [rows, filter, sort]);

  // Widths come from a sample rather than every row: honest enough to read,
  // cheap enough to compute on a million rows.
  const widths = useMemo(() => {
    const sample = rows.slice(0, 200);
    return columns.map((name, column) => {
      let longest = Math.max(name.length, columnTypes?.[column]?.length ?? 0);
      for (const row of sample) longest = Math.max(longest, Math.min(60, cellText(row[column]).length));
      return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, longest * 7.4 + 28));
    });
  }, [columns, columnTypes, rows]);

  const gutter = Math.max(44, String(rows.length).length * 8 + 24);

  const rowVirtualizer = useVirtualizer({
    count: order.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => widths[index],
    overscan: 4,
  });

  const totalWidth = columnVirtualizer.getTotalSize() + gutter;
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const headerHeight = columnTypes ? 44 : ROW_HEIGHT + 2;
  const selectedValue = selected ? rows[selected.row]?.[selected.column] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-panel text-[13px]">
        <div style={{ width: totalWidth, height: rowVirtualizer.getTotalSize() + headerHeight }} className="relative">
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex border-b border-line-strong bg-surface"
            style={{ width: totalWidth, height: headerHeight }}
          >
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface"
              style={{ width: gutter }}
            />
            <div className="relative flex-1">
              {virtualColumns.map((column) => {
                const active = sort?.column === column.index;
                return (
                  <button
                    key={column.key}
                    type="button"
                    disabled={!sortable}
                    onClick={() =>
                      setSort((current) =>
                        current?.column !== column.index
                          ? { column: column.index, descending: false }
                          : current.descending
                            ? null
                            : { column: column.index, descending: true },
                      )
                    }
                    className="absolute top-0 flex h-full flex-col justify-center border-r border-line px-2.5 text-left transition-colors enabled:hover:bg-panel-hover"
                    style={{ left: column.start, width: column.size }}
                    title={columns[column.index]}
                  >
                    <span className="flex w-full items-center gap-1">
                      <span className="truncate font-semibold text-ink">{columns[column.index] || " "}</span>
                      {active &&
                        (sort.descending ? (
                          <ArrowDown className="size-3 shrink-0 text-ink-soft" />
                        ) : (
                          <ArrowUp className="size-3 shrink-0 text-ink-soft" />
                        ))}
                    </span>
                    {columnTypes?.[column.index] && (
                      <span className="etch mt-1 truncate text-[9px] text-ink-faint">{columnTypes[column.index]}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body */}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowIndex = order[virtualRow.index];
            const row = rows[rowIndex];
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 flex border-b border-line/70 hover:bg-panel-hover"
                style={{ top: virtualRow.start + headerHeight, height: ROW_HEIGHT, width: totalWidth }}
              >
                <div
                  className="readout sticky left-0 z-10 flex shrink-0 items-center justify-end border-r border-line bg-surface pr-2.5 text-[11px] text-ink-faint"
                  style={{ width: gutter }}
                >
                  {rowLabel ? rowLabel(rowIndex) : rowIndex + 1}
                </div>
                <div className="relative flex-1">
                  {virtualColumns.map((column) => {
                    const value = row[column.index];
                    const text = cellText(value);
                    const isSelected = selected?.row === rowIndex && selected.column === column.index;
                    return (
                      <div
                        key={column.key}
                        onClick={() => setSelected({ row: rowIndex, column: column.index })}
                        className={cn(
                          "absolute top-0 flex h-full cursor-default items-center border-r border-line/70 px-2.5",
                          isNumeric(value) && "readout justify-end text-[12px]",
                          isSelected && "z-10 outline-2 -outline-offset-2 outline-seal-ink",
                        )}
                        style={{ left: column.start, width: column.size }}
                      >
                        {value === null ? (
                          <span className="etch text-[9px] text-ink-faint">null</span>
                        ) : (
                          <span className="truncate text-ink">{text}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-surface px-3">
        <span className="readout shrink-0 text-[11px] text-ink-soft">
          {order.length === rows.length
            ? `${rows.length.toLocaleString()} rows`
            : `${order.length.toLocaleString()} of ${rows.length.toLocaleString()} rows`}
          {" · "}
          {columns.length.toLocaleString()} columns
        </span>
        {selected && (
          <span className="min-w-0 truncate text-[12px] text-ink-muted">
            <span className="etch mr-2 text-[9px] text-ink-faint">{columns[selected.column]}</span>
            <span className="select-all">{cellText(selectedValue) || "—"}</span>
          </span>
        )}
      </div>
    </div>
  );
}
