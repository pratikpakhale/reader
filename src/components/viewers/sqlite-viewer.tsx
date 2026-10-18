"use client";

import { useMemo, useState } from "react";
import type { Database } from "sql.js";
import { ChevronLeft, ChevronRight, Eye, PanelLeft, Play, Table2, TerminalSquare } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { columnsOf, listObjects, quoteIdentifier, readPage, runQuery, type DbObject, type ResultSet } from "@/lib/sqlite/query";
import { DataGrid } from "@/components/data-grid";
import {
  BarDivider,
  LoadFailed,
  Readout,
  SearchField,
  Segmented,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";

const PAGE_SIZE = 5000;
const QUERY_CAP = 50_000;

type Tab = "table" | "query";

async function openDatabase(blob: Blob, signal: AbortSignal) {
  const { default: initSqlJs } = await import("sql.js");
  const SQL = await initSqlJs({ locateFile: (file: string) => `/vendor/sqljs/${file}` });
  const db = new SQL.Database(new Uint8Array(await blob.arrayBuffer()));
  // The database lives as long as this load does.
  if (signal.aborted) db.close();
  else signal.addEventListener("abort", () => db.close(), { once: true });
  // Reading the schema is what proves the bytes are a database.
  return { db, objects: listObjects(db) };
}

export default function SqliteViewer({ doc }: ViewerProps) {
  const state = useLoad((signal) => openDatabase(doc.blob, signal), [doc.id]);
  return (
    <ViewerFrame>
      {state.status === "loading" && <ViewerStatus loading title="Opening database" />}
      {state.status === "error" && <LoadFailed error={state.error} what="this database" />}
      {state.status === "ready" && <DatabaseView db={state.value.db} objects={state.value.objects} />}
    </ViewerFrame>
  );
}

function DatabaseView({ db, objects }: { db: Database; objects: DbObject[] }) {
  const [selected, setSelected] = useState(objects[0]?.name);
  const [tab, setTab] = useState<Tab>(objects.length ? "table" : "query");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const object = objects.find((candidate) => candidate.name === selected);
  // Kept here so the draft survives a trip to the Table tab.
  const [sql, setSql] = useState(() =>
    objects[0] ? `SELECT * FROM ${quoteIdentifier(objects[0].name)} LIMIT 100;` : "SELECT sqlite_version();",
  );

  const list = (
    <nav aria-label="Tables and views" className="flex flex-col gap-px p-2">
      {objects.map((candidate) => {
        const Icon = candidate.type === "view" ? Eye : Table2;
        const active = candidate.name === selected && tab === "table";
        return (
          <button
            key={candidate.name}
            type="button"
            aria-current={active}
            onClick={() => {
              setSelected(candidate.name);
              setTab("table");
              setSheetOpen(false);
            }}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors",
              active ? "bg-panel-hover text-ink" : "text-ink-muted hover:bg-panel-hover hover:text-ink",
            )}
            title={candidate.name}
          >
            <Icon className="size-3.5 shrink-0 text-ink-faint" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
            {candidate.rows !== undefined && (
              <span className="readout shrink-0 text-[11px] text-ink-faint">{candidate.rows.toLocaleString()}</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <ViewerBar>
        <ToolButton icon={PanelLeft} label="Tables" className="md:hidden" active={sheetOpen} onClick={() => setSheetOpen((open) => !open)} />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "table", label: "Table", icon: Table2 },
            { value: "query", label: "Query", icon: TerminalSquare },
          ]}
        />
        <BarDivider />
        <SearchField value={filter} onChange={setFilter} placeholder="Filter rows" />
      </ViewerBar>
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-line bg-surface md:block">{list}</aside>
        {sheetOpen && (
          <>
            <button
              type="button"
              aria-label="Close tables"
              className="absolute inset-0 z-20 bg-ink/20 md:hidden"
              onClick={() => setSheetOpen(false)}
            />
            <aside className="animate-in absolute inset-y-0 left-0 z-30 w-72 max-w-[85%] overflow-y-auto border-r border-line bg-surface shadow-xl md:hidden">
              {list}
            </aside>
          </>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {tab === "table" ? (
            object ? (
              <TableView key={object.name} db={db} object={object} filter={filter} />
            ) : (
              <ViewerStatus title="This database has no tables" />
            )
          ) : (
            <QueryView db={db} filter={filter} sql={sql} onSql={setSql} />
          )}
        </div>
      </div>
    </>
  );
}

function TableView({ db, object, filter }: { db: Database; object: DbObject; filter: string }) {
  const [offset, setOffset] = useState(0);
  const columns = useMemo(() => columnsOf(db, object.name), [db, object.name]);
  const page = useMemo((): ResultSet | Error => {
    try {
      return readPage(db, object.name, offset, PAGE_SIZE);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }, [db, object.name, offset]);

  if (page instanceof Error) return <LoadFailed error={page} what={object.name} />;

  const total = object.rows;
  const end = offset + page.rows.length;
  const hasMore = total !== undefined ? end < total : page.rows.length === PAGE_SIZE;
  const paged = offset > 0 || hasMore;

  return (
    <>
      <DataGrid
        columns={page.columns}
        rows={page.rows}
        columnTypes={page.columns.map((name) => columns.find((column) => column.name === name)?.type ?? "")}
        filter={filter}
        rowLabel={(index) => String(offset + index + 1)}
      />
      {paged && (
        <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-t border-line bg-surface px-2">
          <ToolButton icon={ChevronLeft} label="Previous rows" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} />
          <Readout>
            {(offset + 1).toLocaleString()}–{end.toLocaleString()}
            {total !== undefined && ` of ${total.toLocaleString()}`}
          </Readout>
          <ToolButton icon={ChevronRight} label="Next rows" disabled={!hasMore} onClick={() => setOffset(offset + PAGE_SIZE)} />
        </div>
      )}
    </>
  );
}

function QueryView({
  db,
  filter,
  sql,
  onSql,
}: {
  db: Database;
  filter: string;
  sql: string;
  onSql: (sql: string) => void;
}) {
  const [outcome, setOutcome] = useState<{ result: ResultSet | null } | Error | null>(null);

  const run = () => {
    try {
      setOutcome({ result: runQuery(db, sql, QUERY_CAP) });
    } catch (error) {
      setOutcome(error instanceof Error ? error : new Error(String(error)));
    }
  };

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-surface p-2 sm:p-3">
        <textarea
          value={sql}
          onChange={(event) => onSql(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              run();
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={4}
          aria-label="SQL query"
          className="readout min-h-20 w-full resize-y rounded-lg border border-line bg-panel p-2.5 text-[13px] leading-relaxed text-ink outline-none focus:border-ink-soft"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={run}
            title="Run (⌘/Ctrl + Enter)"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-fill px-3 text-[13px] font-medium text-on-fill transition-colors hover:bg-fill-hover"
          >
            <Play className="size-3.5" strokeWidth={1.75} />
            Run
          </button>
          <span className="flex-1" />
          {outcome && !(outcome instanceof Error) && outcome.result && (
            <Readout>
              {outcome.result.rows.length.toLocaleString()}
              {outcome.result.truncated ? "+" : ""} rows
            </Readout>
          )}
        </div>
        {outcome instanceof Error && (
          <p role="alert" className="readout text-[12px] break-words text-breach">
            {outcome.message}
          </p>
        )}
      </div>
      {outcome && !(outcome instanceof Error) ? (
        outcome.result ? (
          <DataGrid columns={outcome.result.columns} rows={outcome.result.rows} filter={filter} />
        ) : (
          <ViewerStatus title="No rows returned" />
        )
      ) : (
        !(outcome instanceof Error) && <ViewerStatus title="Run a query" />
      )}
    </>
  );
}
