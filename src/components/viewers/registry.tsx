"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { ViewerId } from "@/lib/formats/registry";
import type { Doc, ViewerProps } from "@/lib/library/types";
import { ViewerStatus } from "@/components/viewer-kit";

const loading = () => <ViewerStatus loading title="Loading viewer" />;

/**
 * Each viewer is its own chunk, so opening a PDF never downloads three.js and
 * opening a spreadsheet never downloads pdf.js.
 */
export const VIEWERS: Record<ViewerId, ComponentType<ViewerProps>> = {
  pdf: dynamic(() => import("./pdf-viewer"), { ssr: false, loading }),
  image: dynamic(() => import("./image-viewer"), { ssr: false, loading }),
  raster: dynamic(() => import("./raster-viewer"), { ssr: false, loading }),
  video: dynamic(() => import("./media-viewer").then((m) => m.VideoViewer), { ssr: false, loading }),
  audio: dynamic(() => import("./media-viewer").then((m) => m.AudioViewer), { ssr: false, loading }),
  code: dynamic(() => import("./code-viewer"), { ssr: false, loading }),
  markdown: dynamic(() => import("./markdown-viewer"), { ssr: false, loading }),
  json: dynamic(() => import("./json-viewer"), { ssr: false, loading }),
  table: dynamic(() => import("./table-viewer"), { ssr: false, loading }),
  html: dynamic(() => import("./html-viewer"), { ssr: false, loading }),
  notebook: dynamic(() => import("./notebook-viewer"), { ssr: false, loading }),
  docx: dynamic(() => import("./docx-viewer"), { ssr: false, loading }),
  sheet: dynamic(() => import("./sheet-viewer"), { ssr: false, loading }),
  slides: dynamic(() => import("./slides-viewer"), { ssr: false, loading }),
  epub: dynamic(() => import("./epub-viewer"), { ssr: false, loading }),
  rtf: dynamic(() => import("./rtf-viewer"), { ssr: false, loading }),
  email: dynamic(() => import("./email-viewer"), { ssr: false, loading }),
  archive: dynamic(() => import("./archive-viewer"), { ssr: false, loading }),
  font: dynamic(() => import("./font-viewer"), { ssr: false, loading }),
  model: dynamic(() => import("./model-viewer"), { ssr: false, loading }),
  sqlite: dynamic(() => import("./sqlite-viewer"), { ssr: false, loading }),
  parquet: dynamic(() => import("./parquet-viewer"), { ssr: false, loading }),
  hex: dynamic(() => import("./hex-viewer"), { ssr: false, loading }),
};

export const VIEWER_LABELS: Record<ViewerId, string> = {
  pdf: "PDF",
  image: "Image",
  raster: "Image",
  video: "Video",
  audio: "Audio",
  code: "Text",
  markdown: "Markdown",
  json: "JSON tree",
  table: "Table",
  html: "Web page",
  notebook: "Notebook",
  docx: "Document",
  sheet: "Spreadsheet",
  slides: "Slides",
  epub: "Book",
  rtf: "Rich text",
  email: "Email",
  archive: "Archive",
  font: "Font",
  model: "3D model",
  sqlite: "Database",
  parquet: "Parquet",
  hex: "Hex",
};

/** Formats whose bytes are text, and so can always be read as text too. */
const TEXTUAL = new Set<ViewerId>(["code", "markdown", "json", "table", "html", "notebook", "rtf", "email"]);

/**
 * What "View as" offers: the detected viewer, the alternatives that make
 * sense for the bytes, and hex, which can show anything.
 */
export function viewChoices(doc: Doc): ViewerId[] {
  const detected = doc.format.viewer;
  const choices: ViewerId[] = [detected];
  const add = (...ids: ViewerId[]) => ids.forEach((id) => !choices.includes(id) && choices.push(id));
  if (TEXTUAL.has(detected) || doc.format.id === "svg") add("code", "markdown", "json", "table", "html");
  if (detected === "hex") add("code");
  if (["docx", "slides", "sheet", "epub"].includes(detected) || doc.format.id === "zip") add("archive");
  add("hex");
  return choices;
}

export function viewerFor(doc: Doc): ViewerId {
  return doc.viewAs ?? doc.format.viewer;
}
