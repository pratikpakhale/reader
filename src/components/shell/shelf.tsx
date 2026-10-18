"use client";

import { Plus, X } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import { pickFiles } from "@/lib/library/intake";
import { useLibrary } from "@/lib/library/store";
import type { Doc } from "@/lib/library/types";
import { viewerFor } from "@/components/viewers/registry";
import { VIEWER_ICONS } from "./doc-icon";

function depthOf(doc: Doc, docs: Doc[]) {
  let depth = 0;
  let parent = doc.parentId;
  while (parent && depth < 6) {
    depth += 1;
    parent = docs.find((d) => d.id === parent)?.parentId;
  }
  return depth;
}

/** Everything open, in the order it was opened, with archive contents nested. */
export function Shelf({ onPick }: { onPick?: () => void }) {
  const docs = useLibrary((state) => state.docs);
  const activeId = useLibrary((state) => state.activeId);
  const activate = useLibrary((state) => state.activate);
  const close = useLibrary((state) => state.close);
  const closeAll = useLibrary((state) => state.closeAll);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="etch text-ink-soft">
          Open · <span className="readout">{docs.length}</span>
        </span>
        {docs.length > 1 && (
          <button
            type="button"
            onClick={closeAll}
            className="etch rounded-full px-2 py-1.5 text-ink-faint transition-colors hover:text-breach"
          >
            Close all
          </button>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {docs.map((doc) => {
          const Icon = VIEWER_ICONS[viewerFor(doc)];
          const active = doc.id === activeId;
          const depth = depthOf(doc, docs);
          return (
            <li key={doc.id} className="group relative">
              <button
                type="button"
                onClick={() => {
                  activate(doc.id);
                  onPick?.();
                }}
                title={doc.path ?? doc.name}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg py-2 pr-9 text-left transition-colors",
                  active ? "bg-panel shadow-[0_0_0_1px_var(--line)]" : "hover:bg-panel-hover",
                )}
                style={{ paddingLeft: 10 + depth * 14 }}
              >
                <Icon
                  className={cn("size-4 shrink-0", active ? "text-seal-ink" : "text-ink-faint")}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[13px]", active ? "font-medium text-ink" : "text-ink-muted")}>
                    {doc.name}
                  </span>
                  <span className="etch mt-1 block truncate text-[9px] text-ink-faint">
                    {doc.format.label} · {formatBytes(doc.size)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => close(doc.id)}
                title="Close"
                className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint transition-all hover:bg-line/60 hover:text-ink pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3.5" strokeWidth={1.75} />
                <span className="sr-only">Close {doc.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="shrink-0 border-t border-line p-2 pb-safe">
        <button
          type="button"
          onClick={() => pickFiles()}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-line-strong text-[13px] font-medium text-ink-muted transition-colors hover:border-ink-soft hover:text-ink"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          Open files
        </button>
      </div>
    </div>
  );
}
