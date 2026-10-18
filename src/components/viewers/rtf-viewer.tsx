"use client";

import { useEffect, useRef } from "react";
import type { ViewerProps } from "@/lib/library/types";
import { BarSpacer, LoadFailed, useLoad, ViewerBar, ViewerFrame, ViewerStatus } from "@/components/viewer-kit";
import { SEARCH_HIGHLIGHT_CSS, useTextSearch } from "@/lib/reading/search";
import { FindControls } from "./docx-search";

type Rendered = { kind: "rich"; elements: HTMLElement[] } | { kind: "plain"; text: string };

/**
 * A last resort when rtf.js gives up: drop groups that never hold body text,
 * decode escapes, and strip the remaining control words. Crude, but it reads.
 */
function extractText(source: string) {
  const skipped = /^\{\\(\*|fonttbl|colortbl|stylesheet|info|pict|header|footer|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|themedata|colorschememapping|latentstyles|datastore)/;
  let output = "";
  let depth = 0;
  let skipDepth = -1;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "{") {
      depth++;
      if (skipDepth < 0 && skipped.test(source.slice(i, i + 24))) skipDepth = depth;
    } else if (char === "}") {
      if (depth === skipDepth) skipDepth = -1;
      depth--;
    } else if (skipDepth >= 0) {
      if (char === "\\") i++;
    } else if (char === "\\") {
      const rest = source.slice(i + 1, i + 40);
      const hex = /^'([0-9a-fA-F]{2})/.exec(rest);
      const unicode = /^u(-?\d+) ?\??/.exec(rest);
      const word = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rest);
      if (hex) {
        output += new TextDecoder("windows-1252").decode(new Uint8Array([parseInt(hex[1], 16)]));
        i += hex[0].length;
      } else if (unicode) {
        const code = Number(unicode[1]);
        output += String.fromCharCode(code < 0 ? code + 65536 : code);
        i += unicode[0].length;
      } else if (word) {
        if (["par", "line", "sect", "page"].includes(word[1])) output += "\n";
        else if (word[1] === "tab" || word[1] === "cell") output += "\t";
        else if (word[1] === "row") output += "\n";
        i += word[0].length;
      } else {
        output += rest[0] === "~" ? " " : /[\\{}]/.test(rest[0] ?? "") ? rest[0] : "";
        i++;
      }
    } else if (char !== "\r" && char !== "\n") {
      output += char;
    }
  }
  return output.replace(/\n{3,}/g, "\n\n").trim();
}

function RichText({ doc }: ViewerProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const search = useTextSearch(sheet);

  const state = useLoad(async (): Promise<Rendered> => {
    const buffer = await doc.blob.arrayBuffer();
    try {
      const { RTFJS, EMFJS, WMFJS } = await import("rtf.js");
      RTFJS.loggingEnabled(false);
      EMFJS.loggingEnabled(false);
      WMFJS.loggingEnabled(false);
      const elements = await new RTFJS.Document(buffer, {}).render();
      return { kind: "rich", elements };
    } catch {
      return { kind: "plain", text: extractText(new TextDecoder("windows-1252").decode(buffer)) };
    }
  }, [doc.id]);

  useEffect(() => {
    if (state.status === "ready" && state.value.kind === "rich") sheet.current?.replaceChildren(...state.value.elements);
  }, [state]);

  if (state.status === "loading") return <ViewerStatus loading title="Reading document" />;
  if (state.status === "error") return <LoadFailed error={state.error} what="this document" />;

  return (
    <>
      <ViewerBar>
        <FindControls search={search} />
        <BarSpacer />
      </ViewerBar>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-sunken px-3 py-4 sm:px-6 sm:py-8">
        <style>{SEARCH_HIGHLIGHT_CSS}</style>
        {state.value.kind === "plain" && (
          <p className="mx-auto mb-3 max-w-[52rem] text-[12px] text-ink-soft">
            This file couldn&apos;t be laid out with its formatting, so here is its text.
          </p>
        )}
        <div
          ref={sheet}
          className="mx-auto max-w-[52rem] break-words bg-sheet px-6 py-8 text-[15px] leading-relaxed text-steel-900 shadow-[0_1px_3px_rgb(0_0_0/0.12),0_12px_40px_-12px_rgb(0_0_0/0.25)] sm:px-14 sm:py-14"
        >
          {state.value.kind === "plain" && <div className="font-sans whitespace-pre-wrap">{state.value.text}</div>}
        </div>
      </div>
    </>
  );
}

export default function RtfViewer({ doc }: ViewerProps) {
  return (
    <ViewerFrame>
      <RichText key={doc.id} doc={doc} />
    </ViewerFrame>
  );
}
