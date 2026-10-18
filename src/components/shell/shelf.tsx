"use client";

import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { pickFiles } from "@/lib/library/intake";
import { useLibrary } from "@/lib/library/store";
import type { Doc } from "@/lib/library/types";
import { viewerFor } from "@/components/viewers/registry";
import { ThemeToggle } from "@/components/theme-toggle";
import { VIEWER_ICONS } from "./doc-icon";

function depthOf(doc: Doc, docs: Doc[]) {
  let depth = 0;
  for (let parent = doc.parentId; parent && depth < 6; depth += 1) {
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
      <div className="flex h-12 shrink-0 items-center justify-between pr-2 pl-4">
        <span className="nameplate text-[15px] text-ink">Reader.</span>
        <ThemeToggle className="text-ink-faint hover:bg-sunken hover:text-ink" />
      </div>
      <ul className="min-h-0 flex-1 space-y-px overflow-y-auto overscroll-contain px-2 pb-2">
        {docs.map((doc) => {
          const Icon = VIEWER_ICONS[viewerFor(doc)];
          const active = doc.id === activeId;
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
                  "flex h-8 w-full items-center gap-2.5 rounded-lg pr-9 text-left transition-colors",
                  active ? "bg-panel shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--line)]" : "hover:bg-panel-hover",
                )}
                style={{ paddingLeft: 8 + depthOf(doc, docs) * 14 }}
              >
                <Icon className={cn("size-4 shrink-0", active ? "text-seal-ink" : "text-ink-faint")} strokeWidth={1.75} />
                <span className={cn("min-w-0 truncate text-[13px]", active ? "font-medium text-ink" : "text-ink-muted")}>
                  {doc.name}
                </span>
              </button>
              <button
                type="button"
                onClick={() => close(doc.id)}
                title="Close"
                className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-faint transition-all hover:bg-sunken hover:text-ink focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
              >
                <X className="size-3.5" strokeWidth={1.75} />
                <span className="sr-only">Close {doc.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex shrink-0 items-center gap-1 border-t border-line p-2 pb-safe">
        <button
          type="button"
          onClick={() => pickFiles()}
          className="flex h-8 flex-1 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          Open
        </button>
        {docs.length > 1 && (
          <button
            type="button"
            onClick={closeAll}
            className="h-8 rounded-lg px-2.5 text-[13px] text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
          >
            Close all
          </button>
        )}
      </div>
    </div>
  );
}
