"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { useLibrary } from "@/lib/library/store";
import { cn } from "@/lib/cn";
import { Readout, useBlobUrl, ViewerFrame, ViewerStatus } from "@/components/viewer-kit";

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];

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

const unsupported = <ViewerStatus tone="error" title="This browser can't play this file" />;

export function VideoViewer({ doc }: ViewerProps) {
  const url = useBlobUrl(doc.blob);
  const [failed, setFailed] = useState(false);

  // A subtitle file with the same name, opened alongside, plays as a track.
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

  return (
    <ViewerFrame className="items-center justify-center bg-steel-950">
      {failed
        ? unsupported
        : url && (
            <video src={url} controls playsInline autoPlay onError={() => setFailed(true)} className="max-h-full max-w-full">
              {subtitleUrl && <track kind="subtitles" src={subtitleUrl} default label="Subtitles" />}
            </video>
          )}
    </ViewerFrame>
  );
}

const BARS = 160;

/** Peak amplitude per bar, from the decoded audio. Skipped for very long files. */
function usePeaks(blob: Blob) {
  const [peaks, setPeaks] = useState<number[]>();
  useEffect(() => {
    if (blob.size > 80 * 1024 * 1024) return;
    let cancelled = false;
    void blob
      .arrayBuffer()
      .then((buffer) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(buffer))
      .then((audio) => {
        const data = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const out = Array.from({ length: BARS }, (_, bar) => {
          let peak = 0;
          for (let i = bar * step; i < Math.min(data.length, (bar + 1) * step); i += 16) peak = Math.max(peak, Math.abs(data[i]));
          return peak;
        });
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
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(NaN);
  const [failed, setFailed] = useState(false);
  const peaks = usePeaks(doc.blob);
  const progress = duration ? time / duration : 0;

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  const toggle = () => {
    const element = audio.current;
    if (element) void (element.paused ? element.play() : element.pause());
  };

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const element = audio.current;
      if (!element || (event.target as HTMLElement).closest("input, textarea, button")) return;
      if (event.key === " ") {
        event.preventDefault();
        void (element.paused ? element.play() : element.pause());
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

  if (failed) return <ViewerFrame>{unsupported}</ViewerFrame>;

  return (
    <ViewerFrame className="items-center justify-center gap-8 overflow-auto bg-sunken px-5 py-10">
      {url && (
        <audio
          ref={audio}
          src={url}
          autoPlay
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onError={() => setFailed(true)}
        />
      )}

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
          className="flex h-20 cursor-pointer touch-none items-center gap-[2px]"
        >
          {(peaks ?? Array.from({ length: BARS }, () => 0.06)).map((peak, index, all) => (
            <span
              key={index}
              className={cn("flex-1 rounded-full", index / all.length < progress ? "bg-seal-ink" : "bg-line-strong")}
              style={{ height: `${Math.max(4, peak * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between">
          <Readout className="px-0">{clock(time)}</Readout>
          <Readout className="px-0">{clock(duration)}</Readout>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="w-12" />
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-14 items-center justify-center rounded-full bg-fill text-on-fill transition-transform hover:bg-fill-hover active:scale-95"
        >
          {playing ? <Pause className="size-5" strokeWidth={1.75} /> : <Play className="ml-0.5 size-5" strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          title="Playback speed"
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          className="readout h-8 w-12 rounded-lg text-[12px] text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
        >
          {speed}×
        </button>
      </div>
    </ViewerFrame>
  );
}
