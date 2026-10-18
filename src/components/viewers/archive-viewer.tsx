"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Folder, FolderOpen, Images, List, LoaderCircle, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import type { Doc, ViewerProps } from "@/lib/library/types";
import { openNested } from "@/lib/library/store";
import { formatByName } from "@/lib/formats/registry";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";
import { openArchive, PasswordError, type ArchiveEntry, type OpenedArchive } from "@/lib/archive/open";
import { buildTree, initiallyExpanded, naturalCompare, visibleRows, type TreeNode } from "@/lib/archive/tree";
import { VIEWER_ICONS } from "@/components/shell/doc-icon";
import {
  BarSpacer,
  LoadFailed,
  Readout,
  SearchField,
  Segmented,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { ArchiveGallery } from "./archive-gallery";

const ROW_HEIGHT = 32;
const COMIC = /\.(cbz|cbr|cb7|cbt)$/i;

type Mode = "files" | "gallery";

function baseName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function isPicture(path: string) {
  return formatByName(path)?.viewer === "image";
}

export default function ArchiveViewer({ doc }: ViewerProps) {
  const state = useLoad(
    async (signal) => {
      const archive = await openArchive(doc.blob, doc.name);
      // The archive lives exactly as long as this load: a newer doc, or the
      // viewer going away, aborts it and frees the worker.
      if (signal.aborted) archive.close();
      else signal.addEventListener("abort", () => archive.close(), { once: true });
      return archive;
    },
    [doc.id],
  );

  return (
    <ViewerFrame>
      {state.status === "loading" && <ViewerStatus loading title="Reading archive" />}
      {state.status === "error" && <LoadFailed error={state.error} what="this archive" />}
      {state.status === "ready" && <ArchiveBody doc={doc} archive={state.value} />}
    </ViewerFrame>
  );
}

function ArchiveBody({ doc, archive }: { doc: Doc; archive: OpenedArchive }) {
  const [entries, setEntries] = useState<ArchiveEntry[]>(archive.entries);
  const [locked, setLocked] = useState(archive.locked);
  const [prompt, setPrompt] = useState<{ retry?: string; error?: string } | null>(
    archive.locked ? {} : null,
  );

  const tree = useMemo(() => buildTree(entries), [entries]);
  const pages = useMemo(
    () => entries.filter((entry) => isPicture(entry.path)).map((entry) => entry.path).sort(naturalCompare),
    [entries],
  );
  const galleryWorthy =
    pages.length > 0 && (COMIC.test(doc.name) || (pages.length >= 2 && pages.length / entries.length >= 0.6));
  const [modeChoice, setMode] = useState<Mode | null>(null);
  const mode: Mode = galleryWorthy ? (modeChoice ?? (COMIC.test(doc.name) ? "gallery" : "files")) : "files";

  const [busy, setBusy] = useState<string | null>(null);

  const extract = useCallback(
    async (path: string) => {
      try {
        return await archive.extract(path);
      } catch (error) {
        if (error instanceof PasswordError) {
          setLocked(true);
          setPrompt({ error: error.wrong ? error.message : undefined });
        }
        throw error;
      }
    },
    [archive],
  );

  const open = useCallback(
    async (path: string) => {
      setBusy(path);
      try {
        const blob = await archive.extract(path);
        await openNested(doc, [{ blob, name: baseName(path), path }]);
      } catch (error) {
        if (error instanceof PasswordError) {
          setLocked(true);
          setPrompt({ retry: path, error: error.wrong ? error.message : undefined });
        } else {
          toast.error(`Couldn't extract ${baseName(path)}`, {
            description: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        setBusy(null);
      }
    },
    [archive, doc],
  );

  const unlock = async (password: string) => {
    try {
      setEntries(await archive.unlock(password));
      setLocked(false);
      const retry = prompt?.retry;
      setPrompt(null);
      if (retry) void open(retry);
    } catch (error) {
      setPrompt((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const modeSwitch = galleryWorthy ? (
    <Segmented
      value={mode}
      onChange={setMode}
      options={[
        { value: "files", label: "Files", icon: List },
        { value: "gallery", label: "Gallery", icon: Images },
      ]}
    />
  ) : null;

  const passwordBar = prompt && (
    <PasswordPrompt error={prompt.error} onSubmit={unlock} onDismiss={locked && entries.length ? () => setPrompt(null) : undefined} />
  );

  if (mode === "gallery" && !locked) {
    return (
      <>
        <ArchiveGallery pages={pages} extract={extract} leading={modeSwitch} />
        {passwordBar}
      </>
    );
  }

  return (
    <FileTree
      tree={tree}
      busy={busy}
      onOpen={(path) => void open(path)}
      leading={modeSwitch}
      banner={passwordBar}
      locked={locked}
      onUnlockRequest={() => setPrompt({})}
    />
  );
}

function PasswordPrompt({
  error,
  onSubmit,
  onDismiss,
}: {
  error?: string;
  onSubmit: (password: string) => Promise<void>;
  onDismiss?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setWorking(true);
    await onSubmit(password);
    setWorking(false);
  };
  return (
    <form
      onSubmit={submit}
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-[13px]"
    >
      <LockKeyhole className="size-4 shrink-0 text-ink-soft" strokeWidth={1.75} />
      <span className="text-ink">This archive is encrypted.</span>
      <input
        type="password"
        autoFocus
        autoComplete="off"
        value={password}
        placeholder="Password"
        aria-label="Archive password"
        onChange={(event) => setPassword(event.target.value)}
        className="h-8 w-44 min-w-0 rounded-full border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-ink-soft"
      />
      <button
        type="submit"
        disabled={!password || working}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-[13px] font-medium text-on-fill transition-colors hover:bg-fill-hover disabled:opacity-40"
      >
        {working && <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} />}
        Unlock
      </button>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="h-8 px-2 text-[13px] text-ink-muted hover:text-ink">
          Not now
        </button>
      )}
      {error && <span className="text-breach">{error}</span>}
    </form>
  );
}

function FileTree({
  tree,
  busy,
  onOpen,
  leading,
  banner,
  locked,
  onUnlockRequest,
}: {
  tree: TreeNode;
  busy: string | null;
  onOpen: (path: string) => void;
  leading: ReactNode;
  banner: ReactNode;
  locked: boolean;
  onUnlockRequest: () => void;
}) {
  const [expanded, setExpanded] = useState(() => initiallyExpanded(tree));
  const [filter, setFilter] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return visibleRows(tree, expanded);
    const matches: Array<{ node: TreeNode; depth: number }> = [];
    const walk = (node: TreeNode) => {
      for (const child of node.children ?? []) {
        if (child.children) walk(child);
        else if (child.path.toLowerCase().includes(needle)) matches.push({ node: child, depth: 0 });
      }
    };
    walk(tree);
    return matches;
  }, [tree, expanded, filter]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });

  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const searching = filter.trim() !== "";

  return (
    <>
      <ViewerBar>
        {leading}
        <SearchField value={filter} onChange={setFilter} placeholder="Filter files" />
        <BarSpacer />
        {locked && (
          <button
            type="button"
            onClick={onUnlockRequest}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-ink-muted hover:bg-line/60 hover:text-ink"
          >
            <LockKeyhole className="size-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">Locked</span>
          </button>
        )}
        <Readout>
          {searching ? `${rows.length.toLocaleString()} of ` : ""}
          {tree.files.toLocaleString()} {tree.files === 1 ? "file" : "files"}
          <span className="hidden sm:inline"> · {formatBytes(tree.size)}</span>
        </Readout>
      </ViewerBar>
      {banner}
      {rows.length === 0 ? (
        <ViewerStatus
          title={searching ? "No files match" : locked ? "The file list is encrypted" : "This archive is empty"}
          detail={!searching && locked ? "Enter the password to see what's inside." : undefined}
        />
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-panel">
          <div role="tree" aria-label="Archive contents" className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const { node, depth } = rows[item.index];
              const folder = Boolean(node.children);
              const open = folder && expanded.has(node.path);
              const Icon = folder
                ? open
                  ? FolderOpen
                  : Folder
                : VIEWER_ICONS[formatByName(node.name)?.viewer ?? "hex"];
              const folderPath = searching ? node.path.slice(0, node.path.length - node.name.length - 1) : "";
              return (
                <button
                  key={node.path}
                  type="button"
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-selected={false}
                  aria-expanded={folder ? open : undefined}
                  title={node.path}
                  onClick={() => (folder ? toggle(node.path) : onOpen(node.path))}
                  onKeyDown={(event) => {
                    if (!folder) return;
                    if ((event.key === "ArrowRight" && !open) || (event.key === "ArrowLeft" && open)) {
                      event.preventDefault();
                      toggle(node.path);
                    }
                  }}
                  className="absolute left-0 flex w-full items-center gap-2 border-b border-line/50 pr-3 text-left text-[13px] transition-colors hover:bg-panel-hover focus-visible:bg-panel-hover focus-visible:outline-none"
                  style={{ top: item.start, height: ROW_HEIGHT, paddingLeft: 10 + depth * 16 }}
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 text-ink-faint transition-transform",
                      !folder && "invisible",
                      open && "rotate-90",
                    )}
                    strokeWidth={1.75}
                  />
                  {busy === node.path ? (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-ink-soft" strokeWidth={1.75} />
                  ) : (
                    <Icon className={cn("size-4 shrink-0", folder ? "text-ink-soft" : "text-ink-faint")} strokeWidth={1.75} />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-ink">{node.name}</span>
                    {folderPath && <span className="ml-2 text-[12px] text-ink-faint">{folderPath}</span>}
                  </span>
                  {folder && (
                    <span className="readout hidden shrink-0 text-[11px] text-ink-faint sm:inline">
                      {node.files.toLocaleString()} {node.files === 1 ? "item" : "items"}
                    </span>
                  )}
                  <span className="readout w-16 shrink-0 text-right text-[11px] text-ink-soft">{formatBytes(node.size)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
