"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "@/lib/format";
import { formatById } from "@/lib/formats/registry";
import { openFiles } from "@/lib/library/intake";
import {
  forget,
  forgetAll,
  listRecents,
  onRecentsChange,
  recall,
  remembering,
  setRemembering,
  type Recent,
} from "@/lib/library/recents";
import { VIEWER_ICONS } from "@/components/shell/doc-icon";

function ago(time: number) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(time).toLocaleDateString();
}

/** Files opened before, kept only in this browser. Absent until there is one. */
export function Recents() {
  const [recents, setRecents] = useState<Recent[]>([]);
  const [on, setOn] = useState(true);

  useEffect(() => {
    const refresh = () => {
      setOn(remembering());
      void listRecents().then(setRecents, () => setRecents([]));
    };
    refresh();
    return onRecentsChange(refresh);
  }, []);

  if (recents.length === 0) {
    return on ? null : (
      <p className="etch text-ink-faint">
        Recent files are off ·{" "}
        <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => void setRemembering(true)}>
          Turn on
        </button>
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="etch text-ink-soft">
          Recently opened<span className="max-sm:hidden"> · kept on this device only</span>
        </h2>
        <div className="flex gap-3">
          <button type="button" className="etch text-ink-faint transition-colors hover:text-ink" onClick={() => void forgetAll()}>
            Clear
          </button>
          <button type="button" className="etch text-ink-faint transition-colors hover:text-ink" onClick={() => void setRemembering(false)}>
            Stop remembering
          </button>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {recents.map((recent) => {
          const Icon = VIEWER_ICONS[formatById(recent.formatId).viewer];
          return (
            <li key={recent.id} className="group relative">
              <button
                type="button"
                onClick={async () => {
                  const file = await recall(recent);
                  if (file) openFiles([file]);
                  else {
                    toast("That file is no longer stored here");
                    void forget(recent.id);
                  }
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel py-3 pr-10 pl-3.5 text-left transition-colors hover:border-line-strong hover:bg-panel-hover"
              >
                <Icon className="size-5 shrink-0 text-ink-faint" strokeWidth={1.5} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink">{recent.name}</span>
                  <span className="etch mt-1.5 block text-[9px] text-ink-faint">
                    {formatById(recent.formatId).label} · {formatBytes(recent.size)} · {ago(recent.openedAt)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                title="Forget"
                onClick={() => void forget(recent.id)}
                className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint transition-all hover:bg-line/60 hover:text-ink pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
              >
                <X className="size-3.5" strokeWidth={1.75} />
                <span className="sr-only">Forget {recent.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
