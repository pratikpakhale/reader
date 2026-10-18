import * as XLSX from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full.mjs";
import type { SheetCell, SheetData, WorkerRequest, WorkerResponse } from "./protocol";

// Legacy .xls files carry text in Windows codepages.
XLSX.set_cptable(cptable);

const MAX_ROWS = 1_000_000;
let workbook: XLSX.WorkBook | undefined;

function reply(message: WorkerResponse) {
  // Typed against Window, as the project compiles with the DOM lib; in a worker this is the worker scope.
  self.postMessage(message);
}

function cellValue(cell: XLSX.CellObject | undefined): SheetCell {
  if (!cell) return "";
  const text = cell.w ?? XLSX.utils.format_cell(cell);
  // A plain number stays a number, so it right-aligns and sorts numerically.
  return cell.t === "n" && typeof cell.v === "number" && text === String(cell.v) ? cell.v : text;
}

function readSheet(sheet: XLSX.WorkSheet): SheetData {
  const dense: XLSX.CellObject[][] = sheet["!data"] ?? [];
  const truncated = dense.length > MAX_ROWS;
  const rows: SheetCell[][] = [];
  let columnCount = 0;
  for (let r = 0; r < Math.min(dense.length, MAX_ROWS); r++) {
    const source = dense[r] ?? [];
    const row: SheetCell[] = new Array(source.length);
    for (let c = 0; c < source.length; c++) {
      row[c] = cellValue(source[c]);
      if (row[c] !== "" && c + 1 > columnCount) columnCount = c + 1;
    }
    rows.push(row);
  }
  // Trailing blank rows are formatting, not data.
  while (rows.length && rows.at(-1)!.every((cell) => cell === "")) rows.pop();
  for (const row of rows) row.length = columnCount;
  return { rows, columnCount, truncated };
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "open") {
      workbook = XLSX.read(request.buffer, { type: "array", dense: true, cellStyles: false, cellHTML: false });
      reply({ type: "opened", names: workbook.SheetNames });
    } else if (workbook) {
      const sheet = workbook.Sheets[workbook.SheetNames[request.index]];
      reply({ type: "sheet", index: request.index, data: readSheet(sheet) });
    }
  } catch (error) {
    reply({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      index: request.type === "sheet" ? request.index : undefined,
    });
  }
});
