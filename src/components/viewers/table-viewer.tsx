"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Papa from "papaparse";
import type { ViewerProps } from "@/lib/library/types";
import { extensionOf } from "@/lib/formats/registry";
import { DataGrid, type Cell } from "@/components/data-grid";
import {
  BarSpacer,
  LoadFailed,
  Readout,
  SearchField,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";

const MAX_ROWS = 1_000_000;
const NUMBER = /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?(?:[eE][-+]?\d+)?$/;

const DELIMITERS: Record<string, string> = { tsv: "\t", tab: "\t", psv: "|" };

/** Numbers become numbers so they sort and align as numbers; "007" stays text. */
function cell(value: string): Cell {
  return NUMBER.test(value) ? Number(value) : value;
}

/** A, B, … Z, AA, AB — what a spreadsheet would call the column. */
function letter(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

interface Parsed {
  rows: Cell[][];
  width: number;
  delimiter: string;
  capped: boolean;
}

/** Streams the file through Papa in chunks, so a big CSV never freezes the tab while it reads. */
function parse(doc: ViewerProps["doc"], signal: AbortSignal, onProgress: (rows: number) => void) {
  return new Promise<Parsed>((resolve, reject) => {
    const rows: Cell[][] = [];
    let width = 0;
    let delimiter = "";
    let capped = false;
    Papa.parse<string[]>(new File([doc.blob], doc.name), {
      delimiter: DELIMITERS[extensionOf(doc.name)] ?? "",
      skipEmptyLines: "greedy",
      chunkSize: 2 * 1024 * 1024,
      chunk: (results, parser) => {
        if (signal.aborted) return parser.abort();
        delimiter ||= results.meta.delimiter;
        for (const record of results.data) {
          if (rows.length >= MAX_ROWS) {
            capped = true;
            return parser.abort();
          }
          width = Math.max(width, record.length);
          rows.push(record.map(cell));
        }
        onProgress(rows.length);
      },
      complete: () => resolve({ rows, width, delimiter, capped }),
      error: (error) => reject(error),
    });
  });
}

const DELIMITER_NAMES: Record<string, string> = { ",": "Comma", "\t": "Tab", ";": "Semicolon", "|": "Pipe" };

export default function TableViewer({ doc }: ViewerProps) {
  const [progress, setProgress] = useState(0);
  const loaded = useLoad((signal) => parse(doc, signal, setProgress), [doc.id]);
  const [header, setHeader] = useState(true);
  const [query, setQuery] = useState("");
  const filter = useDeferredValue(query);

  const table = useMemo(() => {
    if (loaded.status !== "ready") return null;
    const { rows, width } = loaded.value;
    if (!header || rows.length === 0) {
      return { columns: Array.from({ length: width }, (_, index) => letter(index)), rows };
    }
    const seen = new Map<string, number>();
    const columns = Array.from({ length: width }, (_, index) => {
      const raw = rows[0][index];
      const name = (index === 0 ? String(raw ?? "").replace(/^﻿/, "") : String(raw ?? "")).trim() || letter(index);
      const count = seen.get(name) ?? 0;
      seen.set(name, count + 1);
      return count ? `${name} (${count + 1})` : name;
    });
    return { columns, rows: rows.slice(1) };
  }, [loaded, header]);

  if (loaded.status === "loading") {
    return (
      <ViewerFrame>
        <ViewerStatus loading title="Reading table" detail={progress ? `${progress.toLocaleString()} rows so far` : undefined} />
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
  if (!table || table.columns.length === 0) {
    return (
      <ViewerFrame>
        <ViewerStatus title="This table is empty" />
      </ViewerFrame>
    );
  }

  const { delimiter, capped } = loaded.value;
  return (
    <ViewerFrame>
      <ViewerBar>
        <ToolButton label="First row is the header" active={header} onClick={() => setHeader((value) => !value)}>
          Header row
        </ToolButton>
        {delimiter && (
          <span className="etch hidden shrink-0 px-1.5 text-ink-faint sm:inline">
            {DELIMITER_NAMES[delimiter] ?? `“${delimiter}”`} separated
          </span>
        )}
        {capped && <Readout className="text-ink-faint">First {MAX_ROWS.toLocaleString()} rows</Readout>}
        <BarSpacer />
        <SearchField value={query} onChange={setQuery} placeholder="Filter rows" />
      </ViewerBar>
      <DataGrid key={String(header)} columns={table.columns} rows={table.rows} filter={filter} />
    </ViewerFrame>
  );
}
