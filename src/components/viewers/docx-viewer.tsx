"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import {
  BarDivider,
  BarSpacer,
  LoadFailed,
  Readout,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { SEARCH_HIGHLIGHT_CSS, useTextSearch } from "@/lib/reading/search";
import { FindControls } from "./docx-search";

/** docx-preview prefixes every class and selector it emits with this, which is what keeps its styles off the app. */
const CLASS = "rd-docx";
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const DESK_PADDING = 24;

/*
 * Pages are zoomed one by one rather than as a block, so the desk stays full
 * width and keeps centring them; `safe center` stops a page wider than the
 * desk from being clipped on its left edge.
 */
const DESK_CSS = `
.${CLASS}-wrapper { background: transparent; padding: ${DESK_PADDING}px; align-items: safe center; min-width: max-content; }
.${CLASS}-wrapper > section.${CLASS} {
  zoom: var(--docx-zoom, 1);
  margin-bottom: ${DESK_PADDING}px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12), 0 12px 40px -12px rgb(0 0 0 / 0.25);
}
@media (max-width: 639px) {
  .${CLASS}-wrapper { padding: 12px; }
  .${CLASS}-wrapper > section.${CLASS} { margin-bottom: 12px; }
}
${SEARCH_HIGHLIGHT_CSS}
`;

type Zoom = "fit" | number;

function WordDocument({ doc }: ViewerProps) {
  const desk = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const styles = useRef<HTMLDivElement>(null);
  const [chosenZoom, setZoom] = useState<Zoom>();
  const [fitScale, setFitScale] = useState(1);
  const [page, setPage] = useState(1);
  const search = useTextSearch(pages);

  const state = useLoad(
    async (signal) => {
      const { parseAsync, renderDocument } = await import("docx-preview");
      const options = {
        className: CLASS,
        inWrapper: true,
        breakPages: true,
        experimental: true,
        useBase64URL: true,
        renderChanges: false,
        renderComments: false,
      };
      const parsed = await parseAsync(doc.blob, options);
      const nodes = await renderDocument(parsed, options);
      if (signal.aborted || !pages.current || !styles.current) return null;
      pages.current.replaceChildren(...nodes.filter((node) => node.nodeName !== "STYLE"));
      styles.current.replaceChildren(...nodes.filter((node) => node.nodeName === "STYLE"));
      const sections = [...pages.current.querySelectorAll<HTMLElement>(`section.${CLASS}`)];
      // Measured before any zoom applies, so this is the page's own width.
      const width = Math.max(...sections.map((section) => section.offsetWidth), 1);
      // A page that fits the desk opens at 100%; on a phone it opens fit-to-width.
      const initialZoom: Zoom = (desk.current?.clientWidth ?? 0) < width + DESK_PADDING * 2 ? "fit" : 1;
      return { sections, width, initialZoom };
    },
    [doc.id],
  );

  const ready = state.status === "ready" ? state.value : null;
  const zoom = chosenZoom ?? ready?.initialZoom ?? 1;
  const scale = zoom === "fit" ? fitScale : zoom;

  useEffect(() => {
    if (!ready || !desk.current) return;
    const element = desk.current;
    const observer = new ResizeObserver(() => {
      const padding = element.clientWidth < 640 ? 24 : DESK_PADDING * 2;
      setFitScale(Math.max(0.1, (element.clientWidth - padding) / ready.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  const onScroll = useCallback(() => {
    if (!ready || !desk.current) return;
    const middle = desk.current.getBoundingClientRect().top + desk.current.clientHeight / 3;
    let current = 1;
    ready.sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= middle) current = index + 1;
    });
    setPage(current);
  }, [ready]);

  const stepZoom = (direction: 1 | -1) =>
    setZoom(
      direction > 0
        ? (STEPS.find((step) => step > scale + 0.001) ?? STEPS.at(-1)!)
        : (STEPS.findLast((step) => step < scale - 0.001) ?? STEPS[0]),
    );

  return (
    <>
      <ViewerBar>
        {ready && <FindControls search={search} />}
        <BarSpacer />
        {ready && (
          <>
            <Readout>
              {page} / {ready.sections.length}
            </Readout>
            <BarDivider />
            <ToolButton icon={ZoomOut} label="Zoom out" onClick={() => stepZoom(-1)} />
            <Readout className="w-12 text-center">{Math.round(scale * 100)}%</Readout>
            <ToolButton icon={ZoomIn} label="Zoom in" onClick={() => stepZoom(1)} />
            <ToolButton icon={MoveHorizontal} label="Fit width" active={zoom === "fit"} onClick={() => setZoom("fit")} />
          </>
        )}
      </ViewerBar>
      <div className="relative min-h-0 flex-1">
        <div
          ref={desk}
          onScroll={onScroll}
          className="absolute inset-0 overflow-auto overscroll-contain bg-sunken"
          style={{ ["--docx-zoom" as string]: scale }}
        >
          <div ref={styles} />
          {/* After the document's own styles, so the desk overrides docx-preview's grey backdrop. */}
          <style>{DESK_CSS}</style>
          <div ref={pages} />
        </div>
        {state.status !== "ready" && (
          <div className="absolute inset-0 flex flex-col bg-sunken">
            {state.status === "loading" ? (
              <ViewerStatus loading title="Laying out pages" />
            ) : (
              <LoadFailed error={state.error} what="this document" />
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function DocxViewer({ doc }: ViewerProps) {
  return (
    <ViewerFrame>
      <WordDocument key={doc.id} doc={doc} />
    </ViewerFrame>
  );
}
