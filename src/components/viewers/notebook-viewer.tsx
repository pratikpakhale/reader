"use client";

import { useMemo, useState, type ReactNode } from "react";
import DOMPurify from "dompurify";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { parseNotebook, type MimeBundle, type NotebookCell, type NotebookOutput } from "@/lib/notebook/parse";
import {
  BarSpacer,
  LoadFailed,
  readText,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { CodeBlock } from "./code-block";
import { Markdown } from "./markdown-render";

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const IMAGES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const ORDER = [...IMAGES, "image/svg+xml", "text/html", "text/markdown", "text/latex", "application/json", "text/plain"];

const stripAnsi = (value: string) => value.replace(ANSI, "");

/** Notebook HTML output (mostly DataFrames) goes into the page, so it is scrubbed hard first. */
function sanitize(html: string) {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button", "object", "embed", "link", "meta", "base"],
    FORBID_ATTR: ["style"],
  });
}

function Gutter({ children }: { children?: ReactNode }) {
  return (
    <div className="etch w-12 shrink-0 pt-[9px] pr-2 text-right text-[9px] text-ink-faint select-none sm:w-16 sm:text-[10px]">
      {children}
    </div>
  );
}

const pre = "max-h-[32rem] overflow-auto font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]";

function Data({ data }: { data: MimeBundle }) {
  const mime = ORDER.find((type) => data[type] !== undefined);
  if (!mime) {
    return <p className="text-[12px] text-ink-faint">Output in {Object.keys(data).join(", ") || "an unknown format"} isn’t shown here.</p>;
  }
  const value = data[mime];
  const body = typeof value === "string" ? value : "";
  if (IMAGES.includes(mime)) {
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI from the notebook itself
    return <img src={`data:${mime};base64,${body.replace(/\s/g, "")}`} alt="Cell output" className="max-w-full bg-sheet" />;
  }
  if (mime === "image/svg+xml") {
    // Drawn as an image, never inlined, so anything scripted inside it stays inert.
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI from the notebook itself
    return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`} alt="Cell output" className="max-w-full bg-sheet" />;
  }
  if (mime === "text/html") {
    return (
      <div
        className={cn(
          "max-h-[40rem] overflow-auto text-[13px] text-ink",
          "[&_table]:border-collapse [&_table]:text-[12px] [&_td]:border-b [&_td]:border-line [&_td]:px-2.5 [&_td]:py-1 [&_td]:text-right",
          "[&_th]:border-b [&_th]:border-line-strong [&_th]:px-2.5 [&_th]:py-1 [&_th]:text-right [&_th]:font-semibold [&_thead_th]:bg-sunken/60",
          "[&_tbody_tr:hover]:bg-panel-hover [&_img]:max-w-full",
        )}
        dangerouslySetInnerHTML={{ __html: sanitize(body) }}
      />
    );
  }
  if (mime === "text/markdown" || mime === "text/latex") return <Markdown source={body} className="text-[14px]" />;
  if (mime === "application/json") return <CodeBlock code={JSON.stringify(value, null, 2)} language="json" copyable={false} />;
  return <pre className={cn(pre, "text-ink")}>{stripAnsi(body)}</pre>;
}

function Output({ output }: { output: NotebookOutput }) {
  if (output.type === "stream") {
    return (
      <pre className={cn(pre, output.name === "stderr" ? "-mx-2 rounded-md bg-breach/8 px-2 py-1 text-ink" : "text-ink-muted")}>
        {stripAnsi(output.text)}
      </pre>
    );
  }
  if (output.type === "error") {
    return (
      <pre className={cn(pre, "-mx-2 rounded-md bg-breach/8 px-2 py-1.5 text-breach")}>
        {stripAnsi(output.traceback) || `${output.name}: ${output.value}`}
      </pre>
    );
  }
  return <Data data={output.data} />;
}

function attachmentResolver(cell: NotebookCell) {
  const attachments = cell.attachments;
  if (!attachments) return undefined;
  return (src: string) => {
    if (!src.startsWith("attachment:")) return undefined;
    const bundle = attachments[decodeURIComponent(src.slice(11))];
    const mime = bundle && Object.keys(bundle).find((type) => type.startsWith("image/"));
    if (!mime) return undefined;
    const data = String(bundle[mime]);
    return mime === "image/svg+xml"
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`
      : `data:${mime};base64,${data.replace(/\s/g, "")}`;
  };
}

function Cell({ cell, language, showCode, showOutputs }: {
  cell: NotebookCell;
  language: string;
  showCode: boolean;
  showOutputs: boolean;
}) {
  const resolveImage = useMemo(() => attachmentResolver(cell), [cell]);

  if (cell.kind === "markdown") {
    if (!cell.source.trim()) return null;
    return (
      <div className="flex">
        <Gutter />
        <Markdown source={cell.source} resolveImage={resolveImage} className="min-w-0 flex-1 px-1 py-2" />
      </div>
    );
  }
  if (cell.kind === "raw") {
    if (!showCode || !cell.source.trim()) return null;
    return (
      <div className="flex">
        <Gutter>raw</Gutter>
        <pre className={cn(pre, "min-w-0 flex-1 rounded-[10px] border border-dashed border-line px-4 py-3 text-ink-muted")}>{cell.source}</pre>
      </div>
    );
  }

  const outputs = showOutputs ? cell.outputs : [];
  if (!showCode && outputs.length === 0) return null;
  const count = cell.count === undefined ? " " : cell.count;
  return (
    <div className="flex flex-col gap-2">
      {showCode && (
        <div className="flex">
          <Gutter>[{count}]:</Gutter>
          <CodeBlock code={cell.source} language={language} className="min-w-0 flex-1" />
        </div>
      )}
      {outputs.map((output, index) => (
        <div key={index} className="flex">
          <Gutter>{output.type === "data" && output.count !== undefined ? `Out[${output.count}]:` : undefined}</Gutter>
          <div className="min-w-0 flex-1 py-1">
            <Output output={output} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotebookViewer({ doc }: ViewerProps) {
  const loaded = useLoad(async () => parseNotebook(await readText(doc.blob)), [doc.id]);
  const [showCode, setShowCode] = useState(true);
  const [showOutputs, setShowOutputs] = useState(true);

  if (loaded.status === "loading") {
    return (
      <ViewerFrame>
        <ViewerStatus loading title="Opening notebook" />
      </ViewerFrame>
    );
  }
  if (loaded.status === "error") {
    return (
      <ViewerFrame>
        <LoadFailed error={loaded.error} what="this notebook" />
      </ViewerFrame>
    );
  }

  const notebook = loaded.value;
  return (
    <ViewerFrame>
      <ViewerBar>
        <BarSpacer />
        <ToolButton label={showCode ? "Hide code" : "Show code"} active={showCode} onClick={() => setShowCode((value) => !value)}>
          Code
        </ToolButton>
        <ToolButton label={showOutputs ? "Hide outputs" : "Show outputs"} active={showOutputs} onClick={() => setShowOutputs((value) => !value)}>
          Outputs
        </ToolButton>
      </ViewerBar>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-panel">
        {notebook.cells.length === 0 ? (
          <ViewerStatus title="This notebook has no cells" />
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-5 py-8 pr-4 pl-1 sm:pr-8 sm:pl-2">
            {notebook.cells.map((cell, index) => (
              <div key={index} className="[contain-intrinsic-size:auto_160px] [content-visibility:auto]">
                <Cell cell={cell} language={notebook.language} showCode={showCode} showOutputs={showOutputs} />
              </div>
            ))}
          </div>
        )}
      </div>
    </ViewerFrame>
  );
}
