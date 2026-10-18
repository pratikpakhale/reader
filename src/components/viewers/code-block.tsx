"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadLanguage, tokenizeLines, type LineTokens } from "@/lib/highlight/shiki";
import { useTheme } from "@/lib/highlight/theme";
import { paint } from "./code-paint";

/** Blocks past this are shown plain; a code block in a document is rarely this big on purpose. */
const BLOCK_LIMIT = 200_000;

/** A highlighted snippet inside a document: a fenced block in Markdown, a notebook cell. */
export function CodeBlock({
  code,
  language,
  className,
  copyable = true,
}: {
  code: string;
  language?: string;
  className?: string;
  copyable?: boolean;
}) {
  const theme = useTheme();
  const source = useMemo(() => code.replace(/\r\n?/g, "\n").replace(/\n$/, ""), [code]);
  const [highlight, setHighlight] = useState<{ source: string; lines: LineTokens[] } | null>(null);

  useEffect(() => {
    if (source.length > BLOCK_LIMIT) return;
    let cancelled = false;
    loadLanguage(language)
      .then(async (grammar) => {
        if (!grammar || cancelled) return;
        const { lines } = await tokenizeLines(source, grammar);
        if (!cancelled) setHighlight({ source, lines });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [source, language]);

  const tokens = highlight?.source === source ? highlight.lines : undefined;
  const lines = useMemo(() => source.split("\n"), [source]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      toast("Copied to clipboard");
    } catch {
      toast("Couldn't copy — the browser refused");
    }
  };

  return (
    <div className={cn("group relative", className)}>
      <pre className="overflow-x-auto rounded-[10px] border border-line bg-sunken/50 px-4 py-3 font-mono text-[12.5px] leading-[1.65] text-ink [tab-size:4]">
        <code>
          {lines.map((line, index) => (
            <Fragment key={index}>
              {paint(line, tokens?.[index], 0, [], theme)}
              {index < lines.length - 1 && "\n"}
            </Fragment>
          ))}
        </code>
      </pre>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          title="Copy"
          aria-label="Copy code"
          className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md border border-line bg-panel text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Copy className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
