/** Messages between the sheet viewer and its parsing worker. */

export type SheetCell = string | number;

export interface SheetData {
  rows: SheetCell[][];
  columnCount: number;
  /** True when the sheet ran past the row cap and was cut short. */
  truncated: boolean;
}

export type WorkerRequest = { type: "open"; buffer: ArrayBuffer } | { type: "sheet"; index: number };

export type WorkerResponse =
  | { type: "opened"; names: string[] }
  | { type: "sheet"; index: number; data: SheetData }
  | { type: "error"; message: string; index?: number };
