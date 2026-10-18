"use client";

import "pdfjs-dist/web/pdf_viewer.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ListTree,
  PanelLeft,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { EventBus, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { loadPdfjs, PDF_ASSETS } from "@/lib/pdf/pdfjs";
import {
  BarDivider,
  BarSpacer,
  LoadFailed,
  Readout,
  SearchField,
  ToolButton,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { Popover, MenuItem } from "@/components/shell/popover";

interface Engine {
  pdf: PDFDocumentProxy;
  viewer: PDFViewer;
  bus: EventBus;
  link: PDFLinkService;
  find: PDFFindController;
}

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

type Panel = "none" | "pages" | "outline";

const ZOOMS = [
  { value: "page-width", label: "Fit width" },
  { value: "page-fit", label: "Fit page" },
  { value: "auto", label: "Automatic" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];

const positionKey = (doc: ViewerProps["doc"]) => `reader-pdf:${doc.name}:${doc.size}`;

function Thumbnail({ pdf, number, active, onClick }: {
  pdf: PDFDocumentProxy;
  number: number;
  active: boolean;
  onClick: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLButtonElement>(null);
  const [drawn, setDrawn] = useState(false);

  // Drawn only once scrolled near, so a 900-page manual opens instantly.
  useEffect(() => {
    const element = holder.current;
    if (!element || drawn) return;
    let cancelled = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const page = await pdf.getPage(number);
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (150 / base.width) * Math.min(2, devicePixelRatio) });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      await page.render({ canvas: canvas.current, viewport }).promise.catch(() => {});
      if (!cancelled) setDrawn(true);
    }, { rootMargin: "400px" });
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pdf, number, drawn]);

  useEffect(() => {
    if (active) holder.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <button ref={holder} type="button" onClick={onClick} className="group flex w-full flex-col items-center gap-1.5 py-2">
      <span
        className={cn(
          "block w-[120px] overflow-hidden rounded-[3px] bg-sheet shadow-[0_1px_2px_rgb(0_0_0/0.18)] outline-2 outline-offset-2 transition-[outline-color]",
          active ? "outline-seal-ink" : "outline-transparent group-hover:outline-line-strong",
        )}
      >
        <canvas ref={canvas} className={cn("block h-auto w-full", !drawn && "aspect-[1/1.3]")} />
      </span>
      <span className={cn("readout text-[11px]", active ? "text-ink" : "text-ink-faint")}>{number}</span>
    </button>
  );
}

function Outline({ nodes, onGo, depth = 0 }: { nodes: OutlineNode[]; onGo: (dest: OutlineNode["dest"]) => void; depth?: number }) {
  return (
    <ul>
      {nodes.map((node, index) => (
        <OutlineItem key={index} node={node} onGo={onGo} depth={depth} />
      ))}
    </ul>
  );
}

function OutlineItem({ node, onGo, depth }: { node: OutlineNode; onGo: (dest: OutlineNode["dest"]) => void; depth: number }) {
  const [open, setOpen] = useState(depth === 0 && node.items.length < 12);
  return (
    <li>
      <div className="flex items-start" style={{ paddingLeft: depth * 12 }}>
        {node.items.length > 0 ? (
          <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 flex size-5 shrink-0 items-center justify-center text-ink-faint hover:text-ink">
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} strokeWidth={1.75} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onGo(node.dest)}
          className="min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-left text-[13px] leading-snug text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink"
        >
          {node.title}
        </button>
      </div>
      {open && node.items.length > 0 && <Outline nodes={node.items} onGo={onGo} depth={depth + 1} />}
    </li>
  );
}

export default function PdfViewer({ doc }: ViewerProps) {
  const container = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLDivElement>(null);
  // pdf.js objects are imperative and mutable, so they live in a ref; `pdf`
  // is the render-facing signal that they are ready.
  const engineRef = useRef<Engine | undefined>(undefined);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [error, setError] = useState<Error>();
  const [askPassword, setAskPassword] = useState<{ retry: boolean; submit: (password: string) => void }>();
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scaleLabel, setScaleLabel] = useState("…");
  const [scaleValue, setScaleValue] = useState("auto");
  // Wide enough for the thumbnails to sit beside the page without crowding it.
  const [panel, setPanel] = useState<Panel>(() => (matchMedia("(min-width: 1280px)").matches ? "pages" : "none"));
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  useEffect(() => {
    let disposed = false;
    let task: { destroy: () => Promise<void> } | undefined;
    let built: Engine | undefined;
    let stopRefit = () => {};

    (async () => {
      const { lib, viewer: V } = await loadPdfjs();
      const data = new Uint8Array(await doc.blob.arrayBuffer());
      if (disposed || !container.current || !inner.current) return;

      const loadingTask = lib.getDocument({ data, ...PDF_ASSETS });
      task = loadingTask;
      loadingTask.onPassword = (submit: (password: string) => void, reason: number) => {
        setAskPassword({ retry: reason === lib.PasswordResponses.INCORRECT_PASSWORD, submit });
      };
      const pdf = await loadingTask.promise;
      setAskPassword(undefined);
      if (disposed) return;

      const bus = new V.EventBus();
      const link = new V.PDFLinkService({ eventBus: bus, externalLinkTarget: V.LinkTarget.BLANK });
      const find = new V.PDFFindController({ eventBus: bus, linkService: link });
      const viewer = new V.PDFViewer({
        container: container.current,
        viewer: inner.current,
        eventBus: bus,
        linkService: link,
        findController: find,
        supportsPinchToZoom: true,
        enableAutoLinking: true,
        maxCanvasPixels: 2 ** 25,
      });
      link.setViewer(viewer);
      link.setDocument(pdf);
      viewer.setDocument(pdf);

      const saved = Number(localStorage.getItem(positionKey(doc)) ?? 1);
      bus.on("pagesinit", () => {
        viewer.currentScaleValue = container.current && container.current.clientWidth < 700 ? "page-width" : "auto";
        if (saved > 1 && saved <= pdf.numPages) viewer.currentPageNumber = saved;
      });
      bus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
        setPage(pageNumber);
        setPageInput(String(pageNumber));
        localStorage.setItem(positionKey(doc), String(pageNumber));
      });
      bus.on("scalechanging", ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
        setScaleLabel(`${Math.round(scale * 100)}%`);
        setScaleValue(presetValue ?? String(scale));
      });
      bus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) =>
        setMatches(matchesCount),
      );
      bus.on("updatefindcontrolstate", ({ matchesCount }: { matchesCount?: { current: number; total: number } }) => {
        if (matchesCount) setMatches(matchesCount);
      });

      // Fit-to presets are only computed when set, so they are re-applied
      // whenever the stage changes size — a rotated phone, a closed panel.
      const refit = new ResizeObserver(() => {
        const preset = viewer.currentScaleValue;
        if (preset && isNaN(Number(preset))) viewer.currentScaleValue = preset;
      });
      refit.observe(container.current!);
      stopRefit = () => refit.disconnect();

      built = { pdf, viewer, bus, link, find };
      engineRef.current = built;
      setPdf(pdf);
      pdf.getOutline().then((items) => !disposed && setOutline((items as OutlineNode[] | null) ?? []));
    })().catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason : new Error(String(reason)));
    });

    return () => {
      disposed = true;
      stopRefit();
      built?.viewer.cleanup();
      engineRef.current = undefined;
      void task?.destroy();
    };
  }, [doc]);

  const search = useCallback(
    (text: string, again = false, backwards = false) => {
      engineRef.current?.bus.dispatch("find", {
        source: null,
        type: again ? "again" : "",
        query: text,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: backwards,
        matchDiacritics: false,
      });
    },
    [],
  );

  // Cmd/Ctrl+F opens the PDF's own search instead of the browser's, which
  // cannot see pages pdf.js has not drawn yet.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearching(true);
        requestAnimationFrame(() => searchBox.current?.querySelector("input")?.focus());
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);

  const goTo = (number: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.viewer.currentPageNumber = Math.min(Math.max(1, number), engine.pdf.numPages);
  };
  const zoom = (factor: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.viewer.currentScale = Math.min(10, Math.max(0.1, engine.viewer.currentScale * factor));
  };

  if (error) {
    return (
      <ViewerFrame>
        <LoadFailed error={error} what="this PDF" />
      </ViewerFrame>
    );
  }

  const pages = pdf?.numPages ?? 0;
  const withViewer = (act: (viewer: PDFViewer) => void) => {
    if (engineRef.current) act(engineRef.current.viewer);
  };

  return (
    <ViewerFrame>
      <ViewerBar>
        <ToolButton
          icon={PanelLeft}
          label="Pages"
          active={panel === "pages"}
          onClick={() => setPanel(panel === "pages" ? "none" : "pages")}
        />
        {outline.length > 0 && (
          <ToolButton
            icon={ListTree}
            label="Contents"
            active={panel === "outline"}
            onClick={() => setPanel(panel === "outline" ? "none" : "outline")}
          />
        )}
        <BarDivider />
        <ToolButton icon={ChevronUp} label="Previous page" disabled={page <= 1} onClick={() => withViewer((viewer) => viewer.previousPage())} />
        <form
          className="flex shrink-0 items-center"
          onSubmit={(event) => {
            event.preventDefault();
            goTo(Number(pageInput));
          }}
        >
          <input
            value={pageInput}
            inputMode="numeric"
            aria-label="Page"
            onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
            onBlur={() => setPageInput(String(page))}
            className="readout h-7 w-10 rounded-md border border-line bg-panel text-center text-[12px] text-ink outline-none focus:border-ink-soft"
          />
          <Readout>/ {pages || "…"}</Readout>
        </form>
        <ToolButton icon={ChevronDown} label="Next page" disabled={page >= pages} onClick={() => withViewer((viewer) => viewer.nextPage())} />
        <BarDivider />
        <ToolButton icon={ZoomOut} label="Zoom out" onClick={() => zoom(1 / 1.2)} />
        <Popover
          align="start"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="readout inline-flex h-8 w-16 shrink-0 items-center justify-center rounded-lg text-[12px] text-ink-muted hover:bg-sunken hover:text-ink"
            >
              {scaleLabel}
            </button>
          )}
        >
          {(close) =>
            ZOOMS.map((option) => (
              <MenuItem
                key={option.value}
                active={scaleValue === option.value}
                onClick={() => {
                  withViewer((viewer) => (viewer.currentScaleValue = option.value));
                  close();
                }}
              >
                {option.label}
              </MenuItem>
            ))
          }
        </Popover>
        <ToolButton icon={ZoomIn} label="Zoom in" onClick={() => zoom(1.2)} />
        <BarSpacer />
        {searching ? (
          <div ref={searchBox} className="flex shrink-0 items-center gap-1">
            <SearchField
              value={query}
              autoFocus
              placeholder="Find in document"
              onChange={(text) => {
                setQuery(text);
                search(text);
                if (!text) setSearching(false);
              }}
              onEnter={(backwards) => search(query, true, backwards)}
            />
            {query && (
              <Readout className="min-w-14 text-center">
                {matches.total ? `${matches.current} / ${matches.total}` : "none"}
              </Readout>
            )}
            <ToolButton icon={ChevronLeft} label="Previous match" disabled={!matches.total} onClick={() => search(query, true, true)} />
            <ToolButton icon={ChevronRight} label="Next match" disabled={!matches.total} onClick={() => search(query, true)} />
          </div>
        ) : (
          <ToolButton icon={Search} label="Find (⌘F)" onClick={() => setSearching(true)} />
        )}
      </ViewerBar>

      <div className="relative flex min-h-0 flex-1">
        {pdf && panel !== "none" && (
          <aside className="absolute inset-y-0 left-0 z-20 w-[180px] shrink-0 overflow-y-auto overscroll-contain border-r border-line bg-surface/95 backdrop-blur-md sm:static sm:bg-surface sm:backdrop-blur-none">
            {panel === "pages" ? (
              <div className="py-2">
                {Array.from({ length: pages }, (_, index) => (
                  <Thumbnail
                    key={index}
                    pdf={pdf}
                    number={index + 1}
                    active={page === index + 1}
                    onClick={() => {
                      goTo(index + 1);
                      if (window.innerWidth < 640) setPanel("none");
                    }}
                  />
                ))}
              </div>
            ) : (
              <nav className="p-1.5">
                <Outline
                  nodes={outline}
                  onGo={(dest) => {
                    if (dest) void engineRef.current?.link.goToDestination(dest as string);
                    if (window.innerWidth < 640) setPanel("none");
                  }}
                />
              </nav>
            )}
          </aside>
        )}

        <div className="relative min-w-0 flex-1 bg-sunken">
          {/* pdf.js requires its container to be absolutely positioned. */}
          <div ref={container} tabIndex={0} className="pdf-stage absolute inset-0 overflow-auto overscroll-contain outline-none">
            <div ref={inner} className="pdfViewer" />
          </div>
          {!pdf && !askPassword && (
            <div className="absolute inset-0 flex">
              <ViewerStatus loading title="Opening PDF" />
            </div>
          )}
          {askPassword && <PasswordPrompt name={doc.name} retry={askPassword.retry} onSubmit={askPassword.submit} />}
        </div>
      </div>
    </ViewerFrame>
  );
}

function PasswordPrompt({ name, retry, onSubmit }: { name: string; retry: boolean; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-sunken p-6">
      <form
        className="w-full max-w-sm rounded-panel border border-line bg-panel p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(password);
        }}
      >
        <p className="etch text-ink-soft">Locked PDF</p>
        <p className="mt-3 truncate text-[15px] font-semibold text-ink">{name}</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className={cn(
            "mt-5 h-10 w-full rounded-lg border bg-surface px-4 text-sm text-ink outline-none focus:border-ink-soft",
            retry ? "border-breach" : "border-line-strong",
          )}
        />
        {retry && <p className="mt-2 text-[12px] text-breach">That password didn’t work.</p>}
        <button
          type="submit"
          className="mt-4 h-10 w-full rounded-lg bg-fill text-sm font-medium text-on-fill transition-colors hover:bg-fill-hover"
        >
          Unlock
        </button>
        <p className="mt-3 text-center text-[12px] text-ink-faint">The password is checked here, on this device.</p>
      </form>
    </div>
  );
}
