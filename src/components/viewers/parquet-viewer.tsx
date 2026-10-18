"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Rows3, TableProperties } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { openParquet, readRows, typeName, type ParquetFile } from "@/lib/parquet/read";
import { DataGrid, type Cell } from "@/components/data-grid";
import {
  BarSpacer,
  LoadFailed,
  Readout,
  SearchField,
  Segmented,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";

const BATCH = 10_000;

type Tab = "data" | "schema";

export default function ParquetViewer({ doc }: ViewerProps) {
  const state = useLoad(async () => {
    const parquet = await openParquet(doc.blob);
    return { parquet, first: await readRows(parquet, 0, Math.min(BATCH, parquet.rowCount)) };
  }, [doc.id]);
  return (
    <ViewerFrame>
      {state.status === "loading" && <ViewerStatus loading title="Reading Parquet" />}
      {state.status === "error" && <LoadFailed error={state.error} what="this Parquet file" />}
      {state.status === "ready" && <ParquetBody parquet={state.value.parquet} first={state.value.first as Cell[][]} />}
    </ViewerFrame>
  );
}

function ParquetBody({ parquet, first }: { parquet: ParquetFile; first: Cell[][] }) {
  const [tab, setTab] = useState<Tab>("data");
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState(first);
  const [more, setMore] = useState<"idle" | "loading" | Error>("idle");

  const columns = useMemo(() => parquet.schema.children.map((child) => child.element.name), [parquet]);
  const columnTypes = useMemo(() => parquet.schema.children.map(typeName), [parquet]);

  const loadMore = async () => {
    setMore("loading");
    try {
      const next = await readRows(parquet, rows.length, Math.min(parquet.rowCount, rows.length + BATCH));
      setRows((current) => current.concat(next as Cell[][]));
      setMore("idle");
    } catch (error) {
      setMore(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return (
    <>
      <ViewerBar>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "data", label: "Data", icon: Rows3 },
            { value: "schema", label: "Schema", icon: TableProperties },
          ]}
        />
        <BarSpacer />
        {tab === "data" && <SearchField value={filter} onChange={setFilter} placeholder="Filter rows" />}
      </ViewerBar>
      {tab === "data" ? (
        <DataGrid
          columns={columns}
          rows={rows}
          columnTypes={columnTypes}
          filter={filter}
          footerEnd={
            rows.length < parquet.rowCount && (
              <>
                {more instanceof Error && <span className="truncate text-[12px] text-breach">{more.message}</span>}
                <Readout>of {parquet.rowCount.toLocaleString()}</Readout>
                <button
                  type="button"
                  disabled={more === "loading"}
                  onClick={() => void loadMore()}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-50"
                >
                  {more === "loading" && <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />}
                  Load more
                </button>
              </>
            )
          }
        />
      ) : (
        <SchemaView parquet={parquet} />
      )}
    </>
  );
}

function SchemaView({ parquet }: { parquet: ParquetFile }) {
  const rows = useMemo<Cell[][]>(() => {
    const out: Cell[][] = [];
    const walk = (node: ParquetFile["schema"], depth: number) => {
      for (const child of node.children) {
        out.push([
          `${"\u2003".repeat(depth)}${child.element.name}`,
          typeName(child),
          (child.element.repetition_type ?? "").toLowerCase(),
        ]);
        walk(child, depth + 1);
      }
    };
    walk(parquet.schema, 0);
    return out;
  }, [parquet.schema]);

  return <DataGrid columns={["Column", "Type", "Repetition"]} rows={rows} sortable={false} />;
}
