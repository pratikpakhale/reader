"use client";

import { useEffect, useState } from "react";
import { filesFromDrop, openFiles } from "@/lib/library/intake";

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/** Files can be dropped anywhere on the page, at any time. */
export function DropTarget() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setArmed(true);
    };
    const over = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setArmed(false);
    };
    const drop = (event: DragEvent) => {
      if (!event.dataTransfer || !carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setArmed(false);
      void filesFromDrop(event.dataTransfer).then(openFiles);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  if (!armed) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-steel-950/40 p-6 backdrop-blur-[2px]">
      <div className="flex h-full max-h-[480px] w-full max-w-3xl items-center justify-center rounded-panel border-2 border-dashed border-seal-lamp bg-steel-950/70">
        <p className="headline text-[clamp(2rem,5vw,3.5rem)] text-white">Let go to open</p>
      </div>
    </div>
  );
}
