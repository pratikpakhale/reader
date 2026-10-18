import type { Database, SqlValue, Statement } from "sql.js";

export interface DbObject {
  name: string;
  type: "table" | "view";
  /** Counted for tables only: counting a view runs its whole query. */
  rows?: number;
}

export interface ResultSet {
  columns: string[];
  rows: SqlValue[][];
  /** True when the result was cut at the row cap. */
  truncated: boolean;
}

export function quoteIdentifier(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

export function listObjects(db: Database): DbObject[] {
  const [result] = db.exec(
    "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name COLLATE NOCASE",
  );
  return (result?.values ?? []).map(([name, type]) => {
    const object: DbObject = { name: String(name), type: type === "view" ? "view" : "table" };
    if (object.type === "table") {
      try {
        object.rows = Number(db.exec(`SELECT COUNT(*) FROM ${quoteIdentifier(object.name)}`)[0]?.values[0]?.[0] ?? 0);
      } catch {
        // Virtual tables whose module isn't compiled in can't be counted.
      }
    }
    return object;
  });
}

export function columnsOf(db: Database, table: string): Array<{ name: string; type: string }> {
  const [result] = db.exec(`PRAGMA table_info(${quoteIdentifier(table)})`);
  if (!result) return [];
  const name = result.columns.indexOf("name");
  const type = result.columns.indexOf("type");
  const pk = result.columns.indexOf("pk");
  return result.values.map((row) => ({
    name: String(row[name]),
    type: [String(row[type] || "any"), Number(row[pk]) > 0 ? "pk" : ""].filter(Boolean).join(" · "),
  }));
}

function drain(statement: Statement, cap: number): ResultSet {
  try {
    const rows: SqlValue[][] = [];
    let truncated = false;
    while (statement.step()) {
      if (rows.length === cap) {
        truncated = true;
        break;
      }
      rows.push(statement.get());
    }
    return { columns: statement.getColumnNames(), rows, truncated };
  } finally {
    statement.free();
  }
}

export function readPage(db: Database, table: string, offset: number, limit: number): ResultSet {
  return drain(db.prepare(`SELECT * FROM ${quoteIdentifier(table)} LIMIT ${limit} OFFSET ${offset}`), limit);
}

/**
 * Runs every statement in `sql`, returning the last one that produced
 * columns — so `CREATE TEMP TABLE …; SELECT …` shows the select.
 */
export function runQuery(db: Database, sql: string, cap: number): ResultSet | null {
  let last: ResultSet | null = null;
  for (const statement of db.iterateStatements(sql)) {
    const result = drain(statement, cap);
    if (result.columns.length) last = result;
  }
  return last;
}
