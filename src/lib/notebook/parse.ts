/**
 * A Jupyter notebook, nbformat 3 or 4, reduced to the one shape the viewer
 * draws: cells in order, each with its source and its outputs.
 */

export type MimeBundle = Record<string, unknown>;

export type NotebookOutput =
  | { type: "stream"; name: string; text: string }
  | { type: "data"; data: MimeBundle; count?: number }
  | { type: "error"; name: string; value: string; traceback: string };

export interface NotebookCell {
  kind: "markdown" | "code" | "raw";
  source: string;
  count?: number;
  outputs: NotebookOutput[];
  attachments?: Record<string, MimeBundle>;
}

interface Notebook {
  language: string;
  cells: NotebookCell[];
}

type Json = Record<string, unknown>;

const text = (value: unknown): string =>
  Array.isArray(value) ? value.join("") : typeof value === "string" ? value : "";

// nbformat 3 kept outputs under short keys rather than mime types.
const V3_MIMES: Record<string, string> = {
  text: "text/plain",
  html: "text/html",
  svg: "image/svg+xml",
  png: "image/png",
  jpeg: "image/jpeg",
  latex: "text/latex",
  json: "application/json",
  javascript: "application/javascript",
  markdown: "text/markdown",
};

function output(raw: Json, v3: boolean): NotebookOutput | undefined {
  switch (raw.output_type) {
    case "stream":
      return { type: "stream", name: String(raw.name ?? raw.stream ?? "stdout"), text: text(raw.text) };
    case "error":
    case "pyerr":
      return {
        type: "error",
        name: String(raw.ename ?? "Error"),
        value: String(raw.evalue ?? ""),
        traceback: Array.isArray(raw.traceback) ? raw.traceback.join("\n") : "",
      };
    case "execute_result":
    case "display_data":
    case "pyout": {
      const data: MimeBundle = {};
      if (v3) {
        for (const [key, value] of Object.entries(raw)) {
          if (V3_MIMES[key]) data[V3_MIMES[key]] = key === "json" ? value : text(value);
        }
      } else {
        for (const [mime, value] of Object.entries((raw.data ?? {}) as Json)) {
          data[mime] = mime === "application/json" || mime.endsWith("+json") ? value : text(value);
        }
      }
      const count = raw.execution_count ?? raw.prompt_number;
      return { type: "data", data, count: typeof count === "number" ? count : undefined };
    }
  }
}

function cell(raw: Json, v3: boolean): NotebookCell {
  const kind = raw.cell_type === "code" ? "code" : raw.cell_type === "raw" ? "raw" : "markdown";
  let source = text(v3 && kind === "code" ? raw.input : raw.source);
  if (raw.cell_type === "heading") source = `${"#".repeat(Number(raw.level) || 1)} ${source}`;
  const count = raw.execution_count ?? raw.prompt_number;
  return {
    kind,
    source,
    count: typeof count === "number" ? count : undefined,
    outputs: Array.isArray(raw.outputs)
      ? raw.outputs.flatMap((item) => output(item as Json, v3) ?? [])
      : [],
    attachments: raw.attachments as NotebookCell["attachments"],
  };
}

export function parseNotebook(source: string): Notebook {
  const raw = JSON.parse(source) as Json;
  const metadata = (raw.metadata ?? {}) as Json;
  const kernel = (metadata.kernelspec ?? {}) as Json;
  const info = (metadata.language_info ?? {}) as Json;
  if (Number(raw.nbformat) === 3 || Array.isArray(raw.worksheets)) {
    const worksheets = (raw.worksheets ?? []) as Json[];
    const rawCells = worksheets.flatMap((sheet) => (sheet.cells ?? []) as Json[]);
    const language = metadata.language ?? rawCells.find((item) => item.cell_type === "code")?.language ?? "python";
    return { language: String(language), cells: rawCells.map((item) => cell(item, true)) };
  }
  if (!Array.isArray(raw.cells)) throw new Error("No cells found — this doesn't look like a Jupyter notebook.");
  return {
    language: String(kernel.language ?? info.name ?? "python"),
    cells: (raw.cells as Json[]).map((item) => cell(item, false)),
  };
}
