"use client";

import { useMemo, useState } from "react";
import { Heading } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { cellText, DataGrid } from "@/components/data-grid";
import {
  BarSpacer,
  LoadFailed,
  SearchField,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { openWorkbook, type Workbook } from "@/lib/sheet/client";

/** A, B, …, Z, AA, AB — the column names a spreadsheet user navigates by. */
function columnLetter(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function SheetGrid({ book, index, filter, firstRowHeader }: {
  book: Workbook;
  index: number;
  filter: string;
  firstRowHeader: boolean;
}) {
  const state = useLoad(() => book.sheet(index), [book, index]);

  const table = useMemo(() => {
    if (state.status !== "ready") return null;
    const { rows, columnCount } = state.value;
    const letters = Array.from({ length: columnCount }, (_, column) => columnLetter(column));
    if (!firstRowHeader || rows.length === 0) return { columns: letters, rows, offset: 1 };
    return {
      columns: letters.map((letter, column) => cellText(rows[0][column]).trim() || letter),
      rows: rows.slice(1),
      offset: 2,
    };
  }, [state, firstRowHeader]);

  if (state.status === "loading") return <ViewerStatus loading title="Reading sheet" />;
  if (state.status === "error") return <LoadFailed error={state.error} what="this sheet" />;
  if (!table || table.columns.length === 0) return <ViewerStatus title="This sheet is empty" />;
  return (
    <>
      <DataGrid
        key={`${index}-${firstRowHeader}`}
        columns={table.columns}
        rows={table.rows}
        filter={filter}
        rowLabel={(row) => String(row + table.offset)}
      />
      {state.value.truncated && (
        <p className="shrink-0 border-t border-line bg-surface px-3 py-1.5 text-[12px] text-ink-soft">
          Showing the first {state.value.rows.length.toLocaleString()} rows.
        </p>
      )}
    </>
  );
}

function Spreadsheet({ doc }: ViewerProps) {
  const book = useLoad((signal) => openWorkbook(doc.blob, signal), [doc.id]);
  const [active, setActive] = useState(0);
  const [filter, setFilter] = useState("");
  const [firstRowHeader, setFirstRowHeader] = useState(false);

  if (book.status === "loading") return <ViewerStatus loading title="Opening workbook" />;
  if (book.status === "error") return <LoadFailed error={book.error} what="this workbook" />;
  const { names } = book.value;

  return (
    <>
      <ViewerBar>
        <SearchField value={filter} onChange={setFilter} placeholder="Filter rows" />
        <BarSpacer />
        <ToolButton
          icon={Heading}
          label="Use first row as header"
          active={firstRowHeader}
          onClick={() => setFirstRowHeader((on) => !on)}
        >
          <span className="hidden sm:inline">Header row</span>
        </ToolButton>
      </ViewerBar>
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetGrid book={book.value} index={active} filter={filter} firstRowHeader={firstRowHeader} />
      </div>
      {names.length > 1 && (
        <div
          role="tablist"
          aria-label="Sheets"
          className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-t border-line bg-surface px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {names.map((name, index) => (
            <button
              key={`${index}-${name}`}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={cn(
                "h-7 max-w-48 shrink-0 truncate rounded-lg px-3 text-[12px] font-medium transition-colors",
                index === active ? "bg-fill text-on-fill" : "text-ink-muted hover:bg-sunken hover:text-ink",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function SheetViewer({ doc }: ViewerProps) {
  return (
    <ViewerFrame>
      <Spreadsheet key={doc.id} doc={doc} />
    </ViewerFrame>
  );
}
