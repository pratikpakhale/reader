"use client";

import { ChevronDown, ChevronRight, Download, PanelLeft, X } from "lucide-react";
import { useLibrary } from "@/lib/library/store";
import type { Doc } from "@/lib/library/types";
import { VIEWER_LABELS, viewChoices, viewerFor } from "@/components/viewers/registry";
import { ToolButton } from "@/components/viewer-kit";
import { MenuItem, Popover } from "./popover";

function download(doc: Doc) {
  const url = URL.createObjectURL(doc.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = doc.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * One bar per doc: its name, the viewer's own controls (portalled into
 * `slotRef`), and the actions. On a phone the controls drop to a second row.
 */
export function DocBar({
  doc,
  onShelf,
  slotRef,
}: {
  doc: Doc;
  onShelf: () => void;
  slotRef: (element: HTMLDivElement | null) => void;
}) {
  const close = useLibrary((state) => state.close);
  const viewAs = useLibrary((state) => state.viewAs);
  const parent = useLibrary((state) => state.docs.find((d) => d.id === doc.parentId));
  const current = viewerFor(doc);
  const choices = viewChoices(doc);

  return (
    <header className="flex shrink-0 flex-wrap items-center border-b border-line bg-panel">
      <div className="flex h-12 min-w-0 flex-1 items-center gap-1.5 pl-2 sm:pl-4 md:max-w-[38%] md:flex-none md:pr-2">
        <ToolButton icon={PanelLeft} label="Open files" onClick={onShelf} className="lg:hidden" />
        {parent && (
          <>
            <span className="max-w-32 shrink truncate text-[13px] text-ink-faint max-sm:hidden">{parent.name}</span>
            <ChevronRight className="size-3.5 shrink-0 text-ink-faint max-sm:hidden" strokeWidth={1.75} />
          </>
        )}
        <h1 className="min-w-0 truncate text-[14px] font-semibold text-ink" title={doc.path ?? doc.name}>
          {doc.name}
        </h1>
      </div>

      <div
        ref={slotRef}
        className="order-last flex h-11 min-w-0 basis-full items-center gap-1 overflow-x-auto border-t border-line px-2 [scrollbar-width:none] empty:hidden md:order-none md:h-12 md:flex-1 md:basis-auto md:border-0 md:px-1"
      />

      <div className="flex h-12 shrink-0 items-center gap-1 pr-2 sm:pr-3">
        {choices.length > 1 && (
          <Popover
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                title="View as"
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
              >
                {VIEWER_LABELS[current]}
                <ChevronDown className="size-3.5" strokeWidth={1.75} />
              </button>
            )}
          >
            {(dismiss) =>
              choices.map((choice) => (
                <MenuItem
                  key={choice}
                  active={choice === current}
                  onClick={() => {
                    viewAs(doc.id, choice === doc.format.viewer ? undefined : choice);
                    dismiss();
                  }}
                >
                  {VIEWER_LABELS[choice]}
                </MenuItem>
              ))
            }
          </Popover>
        )}
        <ToolButton icon={Download} label="Save a copy" onClick={() => download(doc)} className="max-sm:hidden" />
        <ToolButton icon={X} label="Close" onClick={() => close(doc.id)} />
      </div>
    </header>
  );
}
