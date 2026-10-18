"use client";

import { useSyncExternalStore } from "react";
import { ChevronDown, Download, Info, Maximize2, PanelLeft, X } from "lucide-react";
import { formatBytes } from "@/lib/format";
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

const fullscreenCapable = () => typeof document !== "undefined" && document.fullscreenEnabled;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 px-2.5 py-1.5">
      <dt className="etch pt-0.5 text-[9px] text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-[13px] break-words text-ink">{children}</dd>
    </div>
  );
}

export function DocBar({
  doc,
  onShelf,
  stage,
}: {
  doc: Doc;
  onShelf: () => void;
  stage: React.RefObject<HTMLElement | null>;
}) {
  const close = useLibrary((state) => state.close);
  const viewAs = useLibrary((state) => state.viewAs);
  const parent = useLibrary((state) => state.docs.find((d) => d.id === doc.parentId));
  const canFullscreen = useSyncExternalStore(() => () => {}, fullscreenCapable, () => false);
  const current = viewerFor(doc);
  const choices = viewChoices(doc);

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2 sm:gap-2 sm:px-3">
      <ToolButton icon={PanelLeft} label="Open files" onClick={onShelf} className="lg:hidden" />

      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-[14px] leading-tight font-semibold text-ink" title={doc.path ?? doc.name}>
          {doc.name}
        </p>
        <p className="etch mt-1 truncate text-[9px] text-ink-faint">
          {doc.format.label} · <span className="readout">{formatBytes(doc.size)}</span>
          {parent && <> · in {parent.name}</>}
        </p>
      </div>

      {choices.length > 1 && (
        <Popover
          trigger={({ toggle, open }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              title="View as"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <span className="hidden sm:inline">{VIEWER_LABELS[current]}</span>
              <span className="sm:hidden">View</span>
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            </button>
          )}
        >
          {(dismiss) => (
            <>
              <p className="etch px-2.5 pt-2 pb-1.5 text-[9px] text-ink-faint">View as</p>
              {choices.map((choice) => (
                <MenuItem
                  key={choice}
                  active={choice === current}
                  hint={choice === doc.format.viewer ? "detected" : undefined}
                  onClick={() => {
                    viewAs(doc.id, choice === doc.format.viewer ? undefined : choice);
                    dismiss();
                  }}
                >
                  {VIEWER_LABELS[choice]}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>
      )}

      <Popover
        className="w-72"
        trigger={({ toggle, open }) => <ToolButton icon={Info} label="Details" active={open} onClick={toggle} />}
      >
        {() => (
          <dl className="py-1">
            <Detail label="Name">{doc.name}</Detail>
            {doc.path && <Detail label="Path">{doc.path}</Detail>}
            <Detail label="Kind">{doc.format.label}</Detail>
            <Detail label="Size">
              <span className="readout">
                {formatBytes(doc.size)} · {doc.size.toLocaleString()} bytes
              </span>
            </Detail>
            {doc.blob.type && <Detail label="Type">{doc.blob.type}</Detail>}
            {doc.lastModified ? (
              <Detail label="Modified">{new Date(doc.lastModified).toLocaleString()}</Detail>
            ) : null}
            {parent && <Detail label="From">{parent.name}</Detail>}
            <Detail label="Stays">On this device</Detail>
          </dl>
        )}
      </Popover>

      <ToolButton icon={Download} label="Save a copy" onClick={() => download(doc)} className="max-sm:hidden" />
      {canFullscreen && (
        <ToolButton
          icon={Maximize2}
          label="Full screen"
          className="max-sm:hidden"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void stage.current?.requestFullscreen();
          }}
        />
      )}
      <ToolButton icon={X} label="Close" onClick={() => close(doc.id)} />
    </div>
  );
}
