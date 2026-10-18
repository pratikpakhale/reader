"use client";

import { createElement, memo, type ComponentProps, type MouseEvent } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { CodeBlock } from "./code-block";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function slugify(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
}

/** GitHub-style ids on headings, so `#install` links and the outline both land. */
function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const seen = new Map<string, number>();
    const visit = (node: HastNode) => {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName ?? "")) {
        const base = slugify(textOf(node)) || "section";
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        node.properties = { ...node.properties, id: count ? `${base}-${count}` : base };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

const LOCAL_IMAGE = /^(data:image\/|blob:)/i;

const heading = "scroll-mt-6 font-display font-semibold tracking-[-0.015em] text-ink";

function Anchor({ href, children, id, title }: ComponentProps<"a">) {
  const external = href && /^(https?:|mailto:)/i.test(href);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!href || external) return;
    event.preventDefault();
    if (!href.startsWith("#")) return;
    const id = decodeURIComponent(href.slice(1));
    const article = event.currentTarget.closest("[data-markdown]");
    article?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <a
      id={id}
      href={href}
      onClick={onClick}
      title={href && !external && !href.startsWith("#") ? `${href} — links inside the file can't be followed here` : title}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
      className="text-seal-ink underline decoration-seal-ink/30 underline-offset-[3px] transition-colors hover:decoration-seal-ink"
    >
      {children}
    </a>
  );
}

/** A plain element with the reading styles; `node` is react-markdown's hast handle, not a DOM prop. */
function el(tag: string, classes: string | ((className?: string) => string)) {
  return function Styled({ node, className, ...props }: { node?: unknown; className?: string }) {
    void node;
    return createElement(tag, { ...props, className: typeof classes === "function" ? classes(className) : cn(classes, className) });
  };
}

const ELEMENTS: Components = {
  h1: el("h1", cn(heading, "mt-10 mb-4 border-b border-line pb-2 text-[1.9em] leading-tight first:mt-0")),
  h2: el("h2", cn(heading, "mt-10 mb-3 border-b border-line pb-1.5 text-[1.45em] leading-snug first:mt-0")),
  h3: el("h3", cn(heading, "mt-8 mb-2 text-[1.2em] leading-snug first:mt-0")),
  h4: el("h4", cn(heading, "mt-6 mb-2 text-[1.05em] first:mt-0")),
  h5: el("h5", cn(heading, "mt-6 mb-2 text-[0.95em] first:mt-0")),
  h6: el("h6", cn(heading, "mt-6 mb-2 text-[0.9em] text-ink-muted first:mt-0")),
  p: el("p", "my-4 first:mt-0 last:mb-0"),
  a: Anchor,
  ul: el("ul", (className) =>
    cn(
      "my-4 pl-6 marker:text-ink-faint [&_ol]:my-1 [&_ul]:my-1",
      className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc",
    ),
  ),
  ol: el("ol", "my-4 list-decimal pl-6 marker:text-ink-soft [&_ol]:my-1 [&_ul]:my-1"),
  li: el("li", (className) => cn("my-1 pl-1", className?.includes("task-list-item") && "list-none pl-0")),
  input: ({ type, checked }) => (
    <input type={type} checked={checked} disabled className="mr-2 size-3.5 translate-y-[1px] accent-[var(--seal-ink)]" />
  ),
  blockquote: el("blockquote", "my-5 border-l-2 border-line-strong pl-4 text-ink-muted"),
  hr: el("hr", "my-10 border-line"),
  code: el("code", "rounded-[5px] bg-sunken px-[0.35em] py-[0.12em] font-mono text-[0.86em] text-ink"),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-[10px] border border-line">
      <table className="w-full border-collapse text-[0.92em] [&_tr:last-child>td]:border-b-0">{children}</table>
    </div>
  ),
  thead: el("thead", "bg-sunken/60"),
  th: el("th", "border-b border-line-strong px-3 py-2 text-left font-semibold whitespace-nowrap"),
  td: el("td", "border-b border-line px-3 py-2 align-top"),
  section: el("section", (className) =>
    cn(className, className?.includes("footnotes") && "mt-12 border-t border-line pt-4 text-[0.88em] text-ink-muted"),
  ),
};

function makeComponents(resolveImage?: (src: string) => string | undefined): Components {
  return {
    ...ELEMENTS,
    pre: ({ node }) => {
      const code = (node?.children[0] ?? node) as HastNode | undefined;
      const classes = (code?.properties?.className as string[] | undefined) ?? [];
      const language = classes.find((name) => name.startsWith("language-"))?.slice(9);
      return <CodeBlock code={code ? textOf(code) : ""} language={language} className="my-5" />;
    },
    img: ({ node, src, alt }) => {
      void node;
      const raw = typeof src === "string" ? src : "";
      const resolved = resolveImage?.(raw) ?? raw;
      if (LOCAL_IMAGE.test(resolved)) {
        // eslint-disable-next-line @next/next/no-img-element -- an inline data: or blob: image from the file itself
        return <img src={resolved} alt={alt ?? ""} className="my-2 inline-block max-w-full rounded-md" />;
      }
      return (
        <span
          title={raw ? `Not loaded: ${raw}` : undefined}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2 py-0.5 align-middle text-[0.85em] text-ink-soft"
        >
          <ImageOff className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{alt || "Image"}</span>
        </span>
      );
    },
  };
}

const DEFAULT_COMPONENTS = makeComponents();

// data: and blob: survive for images; everything else goes through the stock filter.
function urlTransform(url: string, key: string) {
  if (key === "src" && LOCAL_IMAGE.test(url)) return url;
  if (key === "src" && url.startsWith("attachment:")) return url;
  return defaultUrlTransform(url);
}

/**
 * Markdown drawn as a page. Raw HTML in the source is never rendered — there is
 * no rehype-raw — so a hostile README can't run anything.
 */
export const Markdown = memo(function Markdown({
  source,
  resolveImage,
  className,
}: {
  source: string;
  /** Maps an image URL to a data: URI, e.g. a notebook's `attachment:` images. */
  resolveImage?: (src: string) => string | undefined;
  className?: string;
}) {
  return (
    <div data-markdown className={cn("text-[15px] leading-[1.72] break-words text-ink", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }], rehypeHeadingIds]}
        components={resolveImage ? makeComponents(resolveImage) : DEFAULT_COMPONENTS}
        urlTransform={urlTransform}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
