"use client";

import { pickFiles } from "@/lib/library/intake";

/** Drops are caught page-wide by DropTarget; this only opens the picker. */
export function Dropzone() {
  return (
    <button
      type="button"
      onClick={() => pickFiles()}
      className="group flex w-full flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line-strong bg-panel px-6 py-12 text-center transition-colors hover:border-ink-soft sm:py-24"
    >
      <span
        aria-hidden
        className="mb-1 flex size-11 items-center justify-center rounded-full border border-line-strong text-ink-faint transition-colors group-hover:border-ink-soft group-hover:text-ink-muted"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-5">
          <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
      </span>
      <span className="text-lg font-medium text-ink">Drop files or a folder</span>
      <span className="text-sm text-ink-soft">
        or <span className="underline underline-offset-4">choose files</span>
      </span>
    </button>
  );
}
