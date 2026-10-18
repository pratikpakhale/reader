"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Grid3x3, Pause, Play, RotateCcw, Rotate3d } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { loadModel, type LoadedModel } from "@/lib/model/load";
import { createStage, type Stage } from "@/lib/model/stage";
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

function compact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function ModelViewer({ doc }: ViewerProps) {
  const state = useLoad(() => loadModel(doc.blob, doc.name), [doc.id]);
  return (
    <ViewerFrame>
      {state.status === "loading" && <ViewerStatus loading title="Loading model" />}
      {state.status === "error" && <LoadFailed error={state.error} what="this model" />}
      {state.status === "ready" && <ModelStage model={state.value} />}
    </ViewerFrame>
  );
}

function ModelStage({ model }: { model: LoadedModel }) {
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [ground, setGround] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [clip, setClip] = useState(0);
  const [playing, setPlaying] = useState(model.animations.length > 0);
  const clips = model.animations;

  useEffect(() => {
    if (!container.current) return;
    try {
      stage.current = createStage(container.current, model.object, clips);
    } catch (error) {
      // Almost always: no WebGL on this device or in this browser profile.
      queueMicrotask(() => setFailure(error instanceof Error ? error : new Error(String(error))));
      return;
    }
    return () => {
      stage.current?.dispose();
      stage.current = null;
    };
  }, [model, clips]);

  useEffect(() => stage.current?.setWireframe(wireframe), [wireframe, model]);
  useEffect(() => stage.current?.setGround(ground), [ground, model]);
  useEffect(() => stage.current?.setAutoRotate(autoRotate), [autoRotate, model]);
  useEffect(() => stage.current?.play(playing ? clip : null), [playing, clip, model]);

  if (failure) return <LoadFailed error={failure} what="a 3D view on this device" />;

  const { vertices, triangles, meshes } = model.stats;

  return (
    <>
      <ViewerBar>
        <Readout>
          {compact(vertices)} <span className="text-ink-faint">verts</span>
          {triangles > 0 && (
            <>
              {" · "}
              {compact(triangles)} <span className="text-ink-faint">tris</span>
            </>
          )}
          <span className="hidden sm:inline">
            {" · "}
            {meshes} <span className="text-ink-faint">{meshes === 1 ? "mesh" : "meshes"}</span>
          </span>
        </Readout>
        {clips.length > 0 && (
          <>
            <BarDivider />
            <ToolButton
              icon={playing ? Pause : Play}
              label={playing ? "Pause animation" : "Play animation"}
              onClick={() => setPlaying((value) => !value)}
            />
            {clips.length > 1 && (
              <select
                value={clip}
                onChange={(event) => {
                  setClip(Number(event.target.value));
                  setPlaying(true);
                }}
                aria-label="Animation"
                className="h-8 max-w-40 shrink-0 truncate rounded-full border border-line bg-panel px-3 text-[13px] text-ink outline-none focus:border-ink-soft"
              >
                {clips.map((animation, index) => (
                  <option key={index} value={index}>
                    {animation.name || `Clip ${index + 1}`}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        <BarSpacer />
        <ToolButton icon={Rotate3d} label="Auto-rotate" active={autoRotate} onClick={() => setAutoRotate((value) => !value)} />
        <ToolButton icon={Box} label="Wireframe" active={wireframe} onClick={() => setWireframe((value) => !value)} />
        <ToolButton icon={Grid3x3} label="Ground and shadow" active={ground} onClick={() => setGround((value) => !value)} />
        <BarDivider />
        <ToolButton icon={RotateCcw} label="Reset view" onClick={() => stage.current?.resetView()} />
      </ViewerBar>
      {model.missing > 0 && (
        <p className="shrink-0 border-b border-line bg-panel px-3 py-1.5 text-[12px] text-ink-soft">
          {model.missing} external {model.missing === 1 ? "texture wasn't" : "textures weren't"} included in this file, so
          surfaces may look plain.
        </p>
      )}
      <div ref={container} className="relative min-h-0 flex-1 touch-none overflow-hidden bg-sunken" />
    </>
  );
}
