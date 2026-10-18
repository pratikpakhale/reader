"use client";

import { useEffect, useState, type RefObject } from "react";

const MAX_MATCHES = 5000;
const HIGHLIGHT = "reader-search";
const CURRENT = "reader-search-current";

/**
 * The paint for search hits. Highlights live outside the DOM, so they never
 * disturb a rendered document's own markup. Seal-lamp green, as it sits over
 * a white page in either theme.
 */
export const SEARCH_HIGHLIGHT_CSS = `
::highlight(${HIGHLIGHT}) { background-color: rgb(53 224 143 / 0.35); color: inherit; }
::highlight(${CURRENT}) { background-color: #35e08f; color: #0b0f0e; }
`;

/** Every case-insensitive occurrence of `query` in the text under `root`, including ones that span elements. */
function findRanges(root: Node, query: string): Range[] {
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("style, script") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    starts.push(text.length);
    // Lowercased per node so offsets keep matching the DOM wherever casing is length-preserving.
    text += (node as Text).data.toLocaleLowerCase();
  }

  const locate = (offset: number) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return { node: nodes[low], offset: Math.min(offset - starts[low], nodes[low].length) };
  };

  const ranges: Range[] = [];
  for (let at = text.indexOf(needle); at !== -1 && ranges.length < MAX_MATCHES; at = text.indexOf(needle, at + needle.length)) {
    const start = locate(at);
    const end = locate(at + needle.length - 1);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    ranges.push(range);
  }
  return ranges;
}

/**
 * Find-in-document over rendered DOM: matches are painted with the CSS Custom
 * Highlight API and the current one is scrolled into view.
 */
export function useTextSearch(root: RefObject<HTMLElement | null>) {
  const [query, setQueryState] = useState("");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);

  const setQuery = (next: string) => {
    setQueryState(next);
    setRanges(root.current && next.trim() ? findRanges(root.current, next.trim()) : []);
    setIndex(0);
  };

  const step = (backwards = false) => {
    if (ranges.length === 0) return;
    setIndex((current) => (current + (backwards ? ranges.length - 1 : 1)) % ranges.length);
  };

  useEffect(() => {
    if (!("highlights" in CSS) || ranges.length === 0) return;
    CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
    CSS.highlights.set(CURRENT, new Highlight(ranges[index]));
    return () => {
      CSS.highlights.delete(HIGHLIGHT);
      CSS.highlights.delete(CURRENT);
    };
  }, [ranges, index]);

  useEffect(() => {
    ranges[index]?.startContainer.parentElement?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, [ranges, index]);

  return { query, setQuery, count: ranges.length, index, step };
}
