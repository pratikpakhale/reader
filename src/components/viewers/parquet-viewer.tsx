"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Rows3, TableProperties } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { formatBytes } from "@/lib/format";
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
        {tab === "data" && <SearchField value={filter} onChange={setFilter} placeholder="Filter loaded rows" />}
        <BarSpacer />
        <Readout>
          {parquet.rowCount.toLocaleString()} rows
          <span className="hidden sm:inline"> · {columns.length} columns</span>
        </Readout>
      </ViewerBar>
      {tab === "data" ? (
        <>
          <DataGrid columns={columns} rows={rows} columnTypes={columnTypes} filter={filter} />
          {rows.length < parquet.rowCount && (
            <div className="flex h-9 shrink-0 items-center justify-end gap-3 border-t border-line bg-surface px-3">
              {more instanceof Error && <span className="truncate text-[12px] text-breach">{more.message}</span>}
              <Readout>
                {rows.length.toLocaleString()} of {parquet.rowCount.toLocaleString()} loaded
              </Readout>
              <button
                type="button"
                disabled={more === "loading"}
                onClick={() => void loadMore()}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-[12px] font-medium text-ink transition-colors hover:bg-panel-hover disabled:opacity-50"
              >
                {more === "loading" && <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />}
                Load {Math.min(BATCH, parquet.rowCount - rows.length).toLocaleString()} more
              </button>
            </div>
          )}
        </>
      ) : (
        <SchemaView parquet={parquet} />
      )}
    </>
  );
}

function SchemaView({ parquet }: { parquet: ParquetFile }) {
  const { metadata } = parquet;

  const leaves = useMemo(() => {
    const byPath = new Map<string, { type: string; codec: string; encodings: Set<string>; compressed: number; raw: number; nulls: number | null }>();
    for (const group of metadata.row_groups) {
      for (const chunk of group.columns) {
        const meta = chunk.meta_data;
        if (!meta) continue;
        const path = meta.path_in_schema.join(".");
        const entry = byPath.get(path) ?? { type: meta.type, codec: meta.codec, encodings: new Set(), compressed: 0, raw: 0, nulls: 0 };
        meta.encodings.forEach((encoding) => entry.encodings.add(encoding));
        entry.compressed += Number(meta.total_compressed_size);
        entry.raw += Number(meta.total_uncompressed_size);
        const nulls = meta.statistics?.null_count;
        entry.nulls = entry.nulls === null || nulls === undefined ? null : entry.nulls + Number(nulls);
        byPath.set(path, entry);
      }
    }
    return byPath;
  }, [metadata]);

  const rows = useMemo<Cell[][]>(() => {
    const out: Cell[][] = [];
    const walk = (node: ParquetFile["schema"], prefix: string[]) => {
      for (const child of node.children) {
        const path = [...prefix, child.element.name];
        const leaf = leaves.get(path.join("."));
        out.push([
          `${"\u2003".repeat(prefix.length)}${child.element.name}`,
          typeName(child),
          (child.element.repetition_type ?? "").toLowerCase(),
          leaf?.type.toLowerCase() ?? "",
          leaf?.codec.toLowerCase() ?? "",
          leaf ? [...leaf.encodings].join(", ").toLowerCase() : "",
          leaf ? formatBytes(leaf.compressed) : "",
          leaf ? formatBytes(leaf.raw) : "",
          leaf?.nulls ?? null,
        ]);
        walk(child, path);
      }
    };
    walk(parquet.schema, []);
    return out;
  }, [parquet.schema, leaves]);

  const compressed = metadata.row_groups.reduce((sum, group) => sum + Number(group.total_compressed_size ?? 0), 0);
  const raw = metadata.row_groups.reduce((sum, group) => sum + Number(group.total_byte_size), 0);
  const facts: Array<[string, string]> = [
    ["Rows", parquet.rowCount.toLocaleString()],
    ["Row groups", metadata.row_groups.length.toLocaleString()],
    ["Uncompressed", formatBytes(raw)],
    ...(compressed ? ([["Compressed", formatBytes(compressed)]] as Array<[string, string]>) : []),
    ["Format version", String(metadata.version)],
    ...(metadata.created_by ? ([["Created by", metadata.created_by]] as Array<[string, string]>) : []),
    ...(metadata.key_value_metadata ?? [])
      .filter((pair) => pair.key !== "ARROW:schema")
      .map((pair): [string, string] => [pair.key, (pair.value ?? "").slice(0, 200)]),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <dl className="grid shrink-0 grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-b border-line bg-surface px-4 py-3 text-[13px] sm:grid-cols-[auto_1fr_auto_1fr]">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="etch self-center text-ink-faint">{label}</dt>
            <dd className="readout min-w-0 truncate text-[12px] text-ink" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <DataGrid
        columns={["Column", "Type", "Repetition", "Physical", "Codec", "Encodings", "Compressed", "Raw", "Nulls"]}
        rows={rows}
        sortable={false}
      />
    </div>
  );
}
