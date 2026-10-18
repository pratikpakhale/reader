"use client";

import { useMemo, useState, type ReactNode } from "react";
import { TransformComponent, TransformWrapper, useControls, useTransformEffect } from "react-zoom-pan-pinch";
import { Maximize, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { BarSpacer, Readout, ToolButton, useBlobUrl, ViewerBar, ViewerFrame, ViewerStatus } from "@/components/viewer-kit";

function Controls({ info, onRotate }: { info?: ReactNode; onRotate: () => void }) {
  const { zoomIn, zoomOut, fitToView } = useControls();
  const [scale, setScale] = useState(1);
  useTransformEffect(({ state }) => setScale(state.scale));
  return (
    <ViewerBar>
      {info}
      <BarSpacer />
      <ToolButton icon={ZoomOut} label="Zoom out" onClick={() => zoomOut(0.4)} />
      <Readout className="w-12 text-center">{Math.round(scale * 100)}%</Readout>
      <ToolButton icon={ZoomIn} label="Zoom in" onClick={() => zoomIn(0.4)} />
      <ToolButton icon={Maximize} label="Fit" onClick={() => fitToView()} />
      <ToolButton icon={RotateCw} label="Rotate" onClick={onRotate} />
    </ViewerBar>
  );
}

/**
 * A zoomable, pannable, pinchable picture. Shared by every viewer that ends in
 * pixels — native images here, and HEIC, TIFF and PSD once decoded.
 */
export function ImageStage({ src, alt, info }: { src: string; alt: string; info?: ReactNode }) {
  const [turn, setTurn] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) return <ViewerStatus tone="error" title="This browser can't decode this image" />;

  return (
    <TransformWrapper
      key={src}
      minScale={0.05}
      maxScale={40}
      fitOnInit
      centerOnInit
      limitToBounds={false}
      doubleClick={{ mode: "toggle", step: 1.2 }}
      wheel={{ step: 0.12 }}
      keyboard={{ disabled: false }}
    >
      <Controls info={info} onRotate={() => setTurn((t) => t + 90)} />
      <div className="relative min-h-0 flex-1 overflow-hidden bg-sunken">
        <TransformComponent wrapperClass="!size-full" contentClass="!p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL, not an asset next/image could optimise */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            onError={() => setFailed(true)}
            style={{ transform: `rotate(${turn}deg)` }}
            className="max-w-none shadow-[0_1px_3px_rgb(0_0_0/0.12),0_12px_40px_-12px_rgb(0_0_0/0.25)] transition-transform duration-300"
          />
        </TransformComponent>
      </div>
    </TransformWrapper>
  );
}

export default function ImageViewer({ doc }: ViewerProps) {
  // SVGs are drawn from a typed blob so the browser treats them as images —
  // which also means any script inside them never runs.
  const blob = useMemo(
    () =>
      doc.format.id === "svg" && doc.blob.type !== "image/svg+xml"
        ? new Blob([doc.blob], { type: "image/svg+xml" })
        : doc.blob,
    [doc.blob, doc.format.id],
  );
  const url = useBlobUrl(blob);
  return (
    <ViewerFrame>
      {url ? <ImageStage src={url} alt={doc.name} /> : <ViewerStatus loading title="Opening" />}
    </ViewerFrame>
  );
}
