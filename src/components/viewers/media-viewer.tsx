"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Pause, PictureInPicture2, Play, Repeat, Subtitles } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { useLibrary } from "@/lib/library/store";
import { cn } from "@/lib/cn";
import {
  BarDivider,
  BarSpacer,
  Readout,
  Segmented,
  ToolButton,
  useBlobUrl,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";

const SPEEDS = ["0.5", "1", "1.25", "1.5", "2"] as const;

function clock(seconds: number) {
  if (!isFinite(seconds)) return "--:--";
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "").toLowerCase();

/** SRT is VTT with commas in its timestamps and no header. */
function toVtt(text: string) {
  if (text.trimStart().startsWith("WEBVTT")) return text;
  return `WEBVTT\n\n${text.replace(/\r/g, "").replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2")}`;
}

const unsupported = (name: string) => (
  <ViewerStatus
    tone="error"
    title="This browser can't play this file"
    detail={`The codec inside ${name} isn't supported here. Safari, Chrome and Firefox each support different ones — another browser may play it.`}
  />
);

export function VideoViewer({ doc }: ViewerProps) {
  const url = useBlobUrl(doc.blob);
  const video = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>("1");
  useEffect(() => {
    if (video.current) video.current.playbackRate = Number(speed);
  }, [speed]);
  const [loop, setLoop] = useState(false);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number; duration: number }>();

  // A subtitle file with the same name, opened alongside, is offered as a track.
  const subtitleDoc = useLibrary((state) =>
    state.docs.find((other) => other.format.id === "subtitle" && /\.(srt|vtt)$/i.test(other.name) && stem(other.name) === stem(doc.name)),
  );
  const [subtitleUrl, setSubtitleUrl] = useState<string>();
  useEffect(() => {
    if (!subtitleDoc) return;
    let url: string | undefined;
    void subtitleDoc.blob.text().then((text) => {
      url = URL.createObjectURL(new Blob([toVtt(text)], { type: "text/vtt" }));
      setSubtitleUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
      setSubtitleUrl(undefined);
    };
  }, [subtitleDoc]);

  const snapshot = () => {
    const element = video.current;
    if (!element?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext("2d")?.drawImage(element, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      void useLibrary.getState().open(
        [{ blob, name: `${stem(doc.name)} at ${clock(element.currentTime).replace(/:/g, ".")}.png` }],
        { parentId: doc.id },
      );
    }, "image/png");
  };

  return (
    <ViewerFrame>
      <ViewerBar>
        {size && (
          <Readout className="max-sm:hidden">
            {size.width} × {size.height} · {clock(size.duration)}
          </Readout>
        )}
        <BarSpacer />
        <Segmented value={speed} onChange={setSpeed} options={SPEEDS.map((value) => ({ value, label: `${value}×` }))} />
        <BarDivider />
        <ToolButton icon={Repeat} label="Loop" active={loop} onClick={() => setLoop(!loop)} />
        {subtitleUrl && <ToolButton icon={Subtitles} label={`Subtitles from ${subtitleDoc?.name}`} active />}
        <ToolButton icon={Camera} label="Capture frame" onClick={snapshot} />
        {typeof document !== "undefined" && document.pictureInPictureEnabled && (
          <ToolButton icon={PictureInPicture2} label="Picture in picture" onClick={() => void video.current?.requestPictureInPicture()} />
        )}
      </ViewerBar>
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-steel-950">
        {failed
          ? unsupported(doc.name)
          : url && (
              <video
                ref={video}
                src={url}
                controls
                playsInline
                autoPlay
                loop={loop}
                onLoadedMetadata={(event) =>
                  setSize({
                    width: event.currentTarget.videoWidth,
                    height: event.currentTarget.videoHeight,
                    duration: event.currentTarget.duration,
                  })
                }
                onError={() => setFailed(true)}
                className="max-h-full max-w-full"
              >
                {subtitleUrl && <track kind="subtitles" src={subtitleUrl} default label="Subtitles" />}
              </video>
            )}
      </div>
    </ViewerFrame>
  );
}

const BARS = 240;

/** Peak amplitude per bar, from the decoded audio. Skipped for very long files. */
function usePeaks(blob: Blob) {
  const [peaks, setPeaks] = useState<number[]>();
  useEffect(() => {
    if (blob.size > 80 * 1024 * 1024) return;
    let cancelled = false;
    const context = new OfflineAudioContext(1, 1, 44100);
    void blob
      .arrayBuffer()
      .then((buffer) => context.decodeAudioData(buffer))
      .then((audio) => {
        const data = audio.getChannelData(0);
        const step = Math.floor(data.length / BARS) || 1;
        const out: number[] = [];
        for (let bar = 0; bar < BARS; bar += 1) {
          let peak = 0;
          for (let i = bar * step; i < Math.min(data.length, (bar + 1) * step); i += 16) {
            peak = Math.max(peak, Math.abs(data[i]));
          }
          out.push(peak);
        }
        const loudest = Math.max(...out, 0.01);
        if (!cancelled) setPeaks(out.map((peak) => peak / loudest));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blob]);
  return peaks;
}

export function AudioViewer({ doc }: ViewerProps) {
  const url = useBlobUrl(doc.blob);
  const audio = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>("1");
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = Number(speed);
  }, [speed]);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(NaN);
  const [failed, setFailed] = useState(false);
  const peaks = usePeaks(doc.blob);
  const progress = duration ? time / duration : 0;
  const title = useMemo(() => doc.name.replace(/\.[^.]+$/, ""), [doc.name]);

  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  };

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea, button")) return;
      const element = audio.current;
      if (!element) return;
      if (event.key === " ") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowRight") element.currentTime += 5;
      else if (event.key === "ArrowLeft") element.currentTime -= 5;
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, []);

  const seek = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = audio.current;
    if (!element || !duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    element.currentTime = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * duration;
  };

  return (
    <ViewerFrame>
      <ViewerBar>
        <BarSpacer />
        <Segmented value={speed} onChange={setSpeed} options={SPEEDS.map((value) => ({ value, label: `${value}×` }))} />
        <BarDivider />
        <ToolButton icon={Repeat} label="Loop" active={loop} onClick={() => setLoop(!loop)} />
      </ViewerBar>
      {failed ? (
        unsupported(doc.name)
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 overflow-auto bg-sunken px-5 py-10">
          {url && (
            <audio
              ref={audio}
              src={url}
              autoPlay
              loop={loop}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onError={() => setFailed(true)}
            />
          )}

          <div className="w-full max-w-2xl text-center">
            <p className="etch text-ink-faint">{doc.format.label} · {doc.name.split(".").pop()?.toUpperCase()}</p>
            <h2 className="headline mt-4 text-[clamp(1.75rem,5vw,3rem)] break-words text-ink">{title}</h2>
          </div>

          <div className="w-full max-w-2xl">
            <div
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration || 0)}
              aria-valuenow={Math.round(time)}
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                seek(event);
              }}
              onPointerMove={(event) => event.buttons === 1 && seek(event)}
              className="relative flex h-24 cursor-pointer touch-none items-center gap-[2px]"
            >
              {(peaks ?? Array.from({ length: 120 }, () => 0.06)).map((peak, index, all) => (
                <span
                  key={index}
                  className={cn(
                    "flex-1 rounded-full transition-colors",
                    index / all.length < progress ? "bg-seal-ink" : "bg-line-strong",
                  )}
                  style={{ height: `${Math.max(4, peak * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between">
              <Readout className="px-0">{clock(time)}</Readout>
              <Readout className="px-0">{clock(duration)}</Readout>
            </div>
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex size-16 items-center justify-center rounded-full bg-fill text-on-fill transition-transform hover:bg-fill-hover active:scale-95"
          >
            {playing ? <Pause className="size-6" strokeWidth={1.75} /> : <Play className="ml-1 size-6" strokeWidth={1.75} />}
          </button>
        </div>
      )}
    </ViewerFrame>
  );
}
