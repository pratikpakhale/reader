"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Readout, SearchField, ToolButton } from "@/components/viewer-kit";
import type { useTextSearch } from "@/lib/reading/search";

/** Find-in-document controls for a ViewerBar, shared by the Word and rich-text viewers. */
export function FindControls({ search }: { search: ReturnType<typeof useTextSearch> }) {
  const { query, setQuery, count, index, step } = search;
  return (
    <>
      <SearchField value={query} onChange={setQuery} onEnter={step} placeholder="Find in document" />
      {query.trim() && (
        <Readout className="min-w-12 text-center">{count ? `${index + 1}/${count}` : "0/0"}</Readout>
      )}
      <ToolButton icon={ChevronUp} label="Previous match (Shift+Enter)" disabled={!count} onClick={() => step(true)} />
      <ToolButton icon={ChevronDown} label="Next match (Enter)" disabled={!count} onClick={() => step(false)} />
    </>
  );
}
