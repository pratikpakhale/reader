"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, EyeOff, Folder, Layers } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { decodeHeic, decodePsd, readTiff, renderTiffPage, type PsdLayer, type TiffPage } from "@/lib/raster/decode";
import { BarDivider, LoadFailed, Readout, ToolButton, useBlobUrl, useLoad, ViewerFrame, ViewerStatus } from "@/components/viewer-kit";
import { ImageStage } from "./image-viewer";

export default function RasterViewer({ doc }: ViewerProps) {
  return (
    <ViewerFrame>
      {doc.format.id === "psd" ? (
        <PsdView blob={doc.blob} name={doc.name} />
      ) : doc.format.id === "tiff" ? (
        <TiffView blob={doc.blob} name={doc.name} />
      ) : (
        <HeicView blob={doc.blob} name={doc.name} />
      )}
    </ViewerFrame>
  );
}

function Decoded({ blob, name, info }: { blob: Blob; name: string; info?: ReactNode }) {
  const url = useBlobUrl(blob);
  return url ? <ImageStage src={url} alt={name} info={info} /> : <ViewerStatus loading title="Decoding" />;
}

function HeicView({ blob, name }: { blob: Blob; name: string }) {
  const state = useLoad(() => decodeHeic(blob), [blob]);
  if (state.status === "loading") return <ViewerStatus loading title="Decoding HEIC" />;
  if (state.status === "error") return <LoadFailed error={state.error} what="this photo" />;
  return <Decoded blob={state.value} name={name} />;
}

function TiffView({ blob, name }: { blob: Blob; name: string }) {
  const file = useLoad(async () => {
    const buffer = await blob.arrayBuffer();
    const pages = await readTiff(buffer);
    if (!pages.length) throw new Error("No viewable image in this file.");
    // A DNG's first directory is a thumbnail; its best preview is the largest one.
    const largest = pages.reduce((best, page, index) => (page.width * page.height > pages[best].width * pages[best].height ? index : best), 0);
    return { buffer, pages, start: /\.dng$/i.test(name) ? largest : 0 };
  }, [blob]);

  if (file.status === "loading") return <ViewerStatus loading title="Reading TIFF" />;
  if (file.status === "error") return <LoadFailed error={file.error} what="this image" />;
  return <TiffPages buffer={file.value.buffer} pages={file.value.pages} start={file.value.start} name={name} />;
}

function TiffPages({ buffer, pages, start, name }: { buffer: ArrayBuffer; pages: TiffPage[]; start: number; name: string }) {
  const [index, setIndex] = useState(start);
  const page = pages[index];
  const rendered = useLoad(() => renderTiffPage(buffer, page), [page]);

  const pager =
    pages.length > 1 ? (
      <>
        <ToolButton icon={ChevronLeft} label="Previous page" disabled={index === 0} onClick={() => setIndex(index - 1)} />
        <Readout>
          {index + 1} / {pages.length}
        </Readout>
        <ToolButton
          icon={ChevronRight}
          label="Next page"
          disabled={index === pages.length - 1}
          onClick={() => setIndex(index + 1)}
        />
        <BarDivider />
      </>
    ) : null;

  if (rendered.status === "loading") return <ViewerStatus loading title={pages.length > 1 ? `Decoding page ${index + 1}` : "Decoding"} />;
  if (rendered.status === "error") return <LoadFailed error={rendered.error} what="this page" />;
  return <Decoded key={index} blob={rendered.value} name={name} info={pager} />;
}

function PsdView({ blob, name }: { blob: Blob; name: string }) {
  const state = useLoad(async () => decodePsd(await blob.arrayBuffer()), [blob]);
  const [showLayers, setShowLayers] = useState(false);

  if (state.status === "loading") return <ViewerStatus loading title="Decoding Photoshop file" />;
  if (state.status === "error") return <LoadFailed error={state.error} what="this Photoshop file" />;

  const { layers } = state.value;
  const info = layers.length ? (
    <>
      <ToolButton icon={Layers} label="Layers" active={showLayers} onClick={() => setShowLayers((open) => !open)}>
        <span className="hidden sm:inline">Layers</span>
        <span className="readout text-[11px] opacity-70">{layers.length}</span>
      </ToolButton>
      <BarDivider />
    </>
  ) : undefined;

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <Decoded blob={state.value.blob} name={name} info={info} />
      </div>
      {showLayers && <LayerList layers={layers} />}
    </div>
  );
}

function LayerList({ layers }: { layers: PsdLayer[] }) {
  return (
    <aside
      aria-label="Layers"
      className="absolute inset-y-0 right-0 z-10 w-64 max-w-[80%] overflow-y-auto border-l border-line bg-surface py-2 shadow-xl sm:static sm:shadow-none"
    >
      <p className="etch px-3 pb-2 text-ink-faint">Layers · read only</p>
      {layers.map((layer, index) => (
        <div
          key={index}
          className={cn("flex h-8 items-center gap-2 pr-3 text-[13px]", layer.hidden ? "text-ink-faint" : "text-ink")}
          style={{ paddingLeft: 12 + layer.depth * 14 }}
        >
          {layer.group ? (
            <Folder className="size-3.5 shrink-0 text-ink-soft" strokeWidth={1.75} />
          ) : (
            <span className="size-3.5 shrink-0 rounded-[3px] border border-line-strong bg-sheet" />
          )}
          <span className="min-w-0 flex-1 truncate">{layer.name}</span>
          {layer.hidden && <EyeOff className="size-3.5 shrink-0" strokeWidth={1.75} aria-label="Hidden" />}
        </div>
      ))}
    </aside>
  );
}
