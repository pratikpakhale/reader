"use client";

import { useMemo, useState, type ReactNode } from "react";
import { TransformComponent, TransformWrapper, useControls, useTransformEffect } from "react-zoom-pan-pinch";
import { FlipHorizontal2, Grid2x2, Maximize, RotateCw, Scan, ZoomIn, ZoomOut } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import {
  BarDivider,
  BarSpacer,
  Readout,
  ToolButton,
  useBlobUrl,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";

function ZoomReadout() {
  const [scale, setScale] = useState(1);
  useTransformEffect(({ state }) => setScale(state.scale));
  return <Readout className="w-12 text-center">{Math.round(scale * 100)}%</Readout>;
}

function ZoomControls({ onRotate, onFlip, checker, onChecker, info }: {
  onRotate: () => void;
  onFlip: () => void;
  checker: boolean;
  onChecker: () => void;
  info?: ReactNode;
}) {
  const { zoomIn, zoomOut, fitToView, centerView } = useControls();
  return (
    <ViewerBar>
      {info}
      <BarSpacer />
      <ToolButton icon={ZoomOut} label="Zoom out (−)" onClick={() => zoomOut(0.4)} />
      <ZoomReadout />
      <ToolButton icon={ZoomIn} label="Zoom in (+)" onClick={() => zoomIn(0.4)} />
      <ToolButton icon={Maximize} label="Fit (0)" onClick={() => fitToView()} />
      <ToolButton icon={Scan} label="Actual size (1)" onClick={() => centerView(1)} />
      <BarDivider />
      <ToolButton icon={RotateCw} label="Rotate (R)" onClick={onRotate} />
      <ToolButton icon={FlipHorizontal2} label="Flip" onClick={onFlip} />
      <ToolButton icon={Grid2x2} label="Transparency grid" active={checker} onClick={onChecker} />
    </ViewerBar>
  );
}

/**
 * A zoomable, pannable, pinchable picture. Shared by every viewer that ends in
 * pixels — native images here, and HEIC, TIFF and PSD once decoded.
 */
export function ImageStage({ src, alt, info }: { src: string; alt: string; info?: ReactNode }) {
  const [turn, setTurn] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [checker, setChecker] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <ViewerStatus
        tone="error"
        title="This browser can't decode this image"
        detail="The file may be damaged, or in a variant this browser doesn't support."
      />
    );
  }

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
      <ZoomControls
        onRotate={() => setTurn((t) => t + 90)}
        onFlip={() => setFlipped((f) => !f)}
        checker={checker}
        onChecker={() => setChecker((c) => !c)}
        info={
          <>
            {info}
            {size && <Readout>{size.width} × {size.height}</Readout>}
          </>
        }
      />
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          checker
            ? "bg-[length:20px_20px] bg-[conic-gradient(var(--line)_25%,transparent_0_50%,var(--line)_0_75%,transparent_0)]"
            : "bg-sunken",
        )}
      >
        <TransformComponent wrapperClass="!size-full" contentClass="!p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL, not an asset next/image could optimise */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={(event) =>
              setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
            }
            onError={() => setFailed(true)}
            style={{ transform: `rotate(${turn}deg) scaleX(${flipped ? -1 : 1})` }}
            className="max-w-none shadow-[0_1px_3px_rgb(0_0_0/0.12),0_12px_40px_-12px_rgb(0_0_0/0.25)] transition-transform duration-300 [image-rendering:auto]"
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
