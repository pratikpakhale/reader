"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { pickFiles } from "@/lib/library/intake";

/**
 * The big target on the landing page. Drops are caught page-wide by the
 * DropTarget; this only has to look ready for them and open the picker.
 */
export function Dropzone() {
  const [armed, setArmed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => pickFiles()}
      onDragEnter={() => setArmed(true)}
      onDragLeave={() => setArmed(false)}
      onDrop={() => setArmed(false)}
      className={cn(
        "group relative flex w-full cursor-pointer flex-col items-center justify-center text-center",
        "rounded-panel border border-dashed bg-panel transition-all duration-200",
        "gap-3 px-6 py-10 sm:px-8 sm:py-24",
        armed ? "border-solid border-seal-ink bg-seal-wash" : "border-line-strong hover:border-ink-soft",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mb-1 flex size-11 items-center justify-center rounded-full border transition-colors",
          armed
            ? "border-seal-ink text-seal-ink"
            : "border-line-strong text-ink-faint group-hover:border-ink-soft group-hover:text-ink-muted",
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-5">
          <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
      </span>

      <span className="text-lg font-medium text-ink">Drop any file, or a whole folder</span>
      <span className="text-sm text-ink-soft">
        or <span className="underline underline-offset-4">choose files</span>
        <span className="max-sm:hidden"> · paste works too</span>
      </span>
    </button>
  );
}
