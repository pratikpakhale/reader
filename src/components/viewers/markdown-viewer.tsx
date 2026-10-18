"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ListTree, X } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { cn } from "@/lib/cn";
import { readTextCapped } from "@/lib/text/read";
import {
  BarSpacer,
  LoadFailed,
  Readout,
  Segmented,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { CodeView } from "./code-view";
import { CodeBlock } from "./code-block";
import { Markdown } from "./markdown-render";

type Mode = "rendered" | "source";

/** Past this the page would take seconds to lay out, so the file opens on its source. */
const RENDER_LIMIT = 2_000_000;

interface Heading {
  id: string;
  text: string;
  level: number;
}

function splitFrontMatter(text: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n?/.exec(text);
  return match ? { front: match[1], body: text.slice(match[0].length) } : { front: "", body: text };
}

function Outline({
  headings,
  active,
  onPick,
  className,
}: {
  headings: Heading[];
  active?: string;
  onPick: (id: string) => void;
  className?: string;
}) {
  const top = Math.min(...headings.map((heading) => heading.level));
  return (
    <nav aria-label="Outline" className={cn("flex flex-col gap-px", className)}>
      {headings.map((heading) => (
        <button
          key={heading.id}
          type="button"
          onClick={() => onPick(heading.id)}
          className={cn(
            "truncate rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors hover:bg-panel-hover hover:text-ink",
            heading.id === active ? "bg-panel-hover font-medium text-ink" : "text-ink-soft",
          )}
          style={{ paddingLeft: 8 + (heading.level - top) * 12 }}
          title={heading.text}
        >
          {heading.text}
        </button>
      ))}
    </nav>
  );
}

function Rendered({ text, mode, onMode }: { text: string; mode: Mode; onMode: (mode: Mode) => void }) {
  const { front, body } = useMemo(() => splitFrontMatter(text), [text]);
  const scroller = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string>();
  const [aside, setAside] = useState(true);
  const [sheet, setSheet] = useState(false);

  // The outline is read back from the rendered page, so its ids are exactly
  // the ones the headings got.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const found = [...(article.current?.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id]") ?? [])];
      setHeadings(found.map((node) => ({ id: node.id, text: node.textContent ?? "", level: Number(node.tagName[1]) })));
    });
    return () => cancelAnimationFrame(frame);
  }, [body]);

  useEffect(() => {
    const element = scroller.current;
    if (!element || headings.length === 0) return;
    let frame = 0;
    const spy = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = element.getBoundingClientRect().top + 96;
        let current: string | undefined = headings[0].id;
        for (const heading of headings) {
          const node = article.current?.querySelector(`[id="${CSS.escape(heading.id)}"]`);
          if (node && node.getBoundingClientRect().top <= top) current = heading.id;
          else break;
        }
        setActive(current);
      });
    };
    spy();
    element.addEventListener("scroll", spy, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", spy);
    };
  }, [headings]);

  const pick = (id: string) => {
    article.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setSheet(false);
  };

  const toggleOutline = () => {
    if (matchMedia("(min-width: 1024px)").matches) setAside((open) => !open);
    else setSheet((open) => !open);
  };

  const hasOutline = headings.length > 1;

  return (
    <ViewerFrame>
      <ViewerBar>
        <ModeToggle mode={mode} onMode={onMode} />
        {hasOutline && <Readout className="hidden sm:inline">{headings.length} sections</Readout>}
        <BarSpacer />
        {hasOutline && <ToolButton icon={ListTree} label="Outline" active={sheet} onClick={toggleOutline} />}
      </ViewerBar>
      <div className="relative flex min-h-0 flex-1">
        {hasOutline && aside && (
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-line bg-surface px-3 py-5 lg:block">
            <p className="etch mb-3 px-2 text-ink-faint">Outline</p>
            <Outline headings={headings} active={active} onPick={pick} />
          </aside>
        )}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-panel">
          <div ref={article} className="mx-auto max-w-[72ch] px-5 py-8 sm:px-8 sm:py-12">
            {front && (
              <details className="mb-8 text-[13px]">
                <summary className="etch cursor-pointer text-ink-faint select-none">Front matter</summary>
                <CodeBlock code={front} language="yaml" className="mt-2" copyable={false} />
              </details>
            )}
            {body.trim() ? <Markdown source={body} /> : <p className="text-ink-soft">This document is empty.</p>}
          </div>
        </div>
        {hasOutline && sheet && (
          <div className="absolute inset-0 z-30 flex justify-end bg-surface/60 lg:hidden" onClick={() => setSheet(false)}>
            <div
              className="flex h-full w-72 max-w-[85%] flex-col border-l border-line bg-surface shadow-[0_12px_40px_-12px_rgb(0_0_0/0.35)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-5">
                <span className="etch text-ink-faint">Outline</span>
                <ToolButton icon={X} label="Close outline" onClick={() => setSheet(false)} />
              </div>
              <Outline headings={headings} active={active} onPick={pick} className="overflow-y-auto p-3" />
            </div>
          </div>
        )}
      </div>
    </ViewerFrame>
  );
}

function ModeToggle({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  return (
    <Segmented
      value={mode}
      onChange={onMode}
      options={[
        { value: "rendered", label: "Rendered" },
        { value: "source", label: "Source" },
      ]}
    />
  );
}

export default function MarkdownViewer({ doc }: ViewerProps) {
  const loaded = useLoad(() => readTextCapped(doc.blob), [doc.id]);
  const [chosen, setChosen] = useState<Mode>();

  if (loaded.status === "loading") {
    return (
      <ViewerFrame>
        <ViewerStatus loading title="Reading" />
      </ViewerFrame>
    );
  }
  if (loaded.status === "error") {
    return (
      <ViewerFrame>
        <LoadFailed error={loaded.error} />
      </ViewerFrame>
    );
  }

  const { text, notice } = loaded.value;
  const mode = chosen ?? (text.length > RENDER_LIMIT ? "source" : "rendered");
  if (mode === "source") {
    return (
      <CodeView text={text} language="markdown" notice={notice} leading={<ModeToggle mode={mode} onMode={setChosen} />} />
    );
  }
  return <Rendered text={text} mode={mode} onMode={setChosen} />;
}
