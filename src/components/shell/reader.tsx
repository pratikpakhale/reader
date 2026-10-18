"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useActiveDoc, useLibrary } from "@/lib/library/store";
import { ViewerStatus } from "@/components/viewer-kit";
import { DocBar } from "./doc-bar";
import { DropTarget } from "./drop-target";
import { IntakeListeners } from "./intake-listeners";
import { Shelf } from "./shelf";
import { ViewerHost } from "./viewer-host";

/**
 * The landing page until something is open, the reader from then on. One
 * route, so opening a file never navigates and the back button never loses it.
 */
export function ReaderStage({ landing }: { landing: ReactNode }) {
  const hasDocs = useLibrary((state) => state.docs.length > 0);
  const opening = useLibrary((state) => state.opening > 0);

  return (
    <>
      <IntakeListeners />
      <DropTarget />
      {hasDocs ? (
        <Reader />
      ) : opening ? (
        <div className="flex flex-1 flex-col"><ViewerStatus loading title="Opening" /></div>
      ) : (
        landing
      )}
    </>
  );
}

function Reader() {
  const doc = useActiveDoc();
  const [shelfOpen, setShelfOpen] = useState(false);
  const stage = useRef<HTMLElement>(null);

  // The phone shelf is a drawer; it gets out of the way once a doc is chosen,
  // and Esc dismisses it like any sheet.
  useEffect(() => {
    if (!shelfOpen) return;
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setShelfOpen(false);
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [shelfOpen]);

  return (
    <main className="flex h-[calc(100dvh-2.75rem)] min-h-0">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-sunken/60 lg:block">
        <Shelf />
      </aside>

      {/* Phone and tablet drawer */}
      <div
        className={cn("fixed inset-0 top-11 z-40 lg:hidden", shelfOpen ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!shelfOpen}
      >
        <div
          onClick={() => setShelfOpen(false)}
          className={cn("absolute inset-0 bg-steel-950/40 transition-opacity duration-200", shelfOpen ? "opacity-100" : "opacity-0")}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[min(20rem,86vw)] border-r border-line bg-surface shadow-2xl transition-transform duration-250 ease-out",
            shelfOpen ? "translate-x-0" : "-translate-x-full",
          )}
          inert={!shelfOpen}
        >
          <Shelf onPick={() => setShelfOpen(false)} />
        </div>
      </div>

      <section ref={stage} className="flex min-w-0 flex-1 flex-col bg-surface">
        {doc ? (
          <>
            <DocBar doc={doc} stage={stage} onShelf={() => setShelfOpen(true)} />
            <div className="relative min-h-0 flex-1">
              <ViewerHost doc={doc} />
            </div>
          </>
        ) : (
          <ViewerStatus title="Choose a file from the shelf" />
        )}
      </section>
    </main>
  );
}
