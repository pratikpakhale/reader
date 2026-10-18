"use client";

/**
 * The shared vocabulary every viewer is drawn with. A viewer is a full-bleed
 * column: an optional ViewerBar of controls, then a body that owns its scroll.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function ViewerFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("absolute inset-0 flex flex-col", className)}>{children}</div>;
}

/** Where the reader's top bar wants viewer controls drawn, so a doc gets one bar instead of two. */
export const ToolbarSlot = createContext<HTMLElement | null>(null);

/** A viewer's controls. Rendered into the reader's top bar when there is one. */
export function ViewerBar({ children }: { children: ReactNode }) {
  const slot = useContext(ToolbarSlot);
  if (slot) return createPortal(children, slot);
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-3 [scrollbar-width:none]">
      {children}
    </div>
  );
}

export function BarSpacer() {
  return <div className="flex-1" />;
}

export function BarDivider() {
  return <div aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

/** Monospaced, tabular figures: page counts, zoom, timecodes, dimensions. */
export function Readout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("readout shrink-0 px-1.5 text-[12px] whitespace-nowrap text-ink-muted", className)}>
      {children}
    </span>
  );
}

export function ToolButton({
  icon: Icon,
  label,
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={children ? undefined : label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors",
        children ? "px-3" : "w-8",
        active ? "bg-sunken text-ink" : "text-ink-muted hover:bg-sunken hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-35",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-4" strokeWidth={1.75} />}
      {children}
    </button>
  );
}

/** A small pill group: one of a few mutually exclusive choices. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: LucideIcon }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex h-8 shrink-0 items-center rounded-lg bg-sunken p-0.5", className)}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors",
              value === option.value ? "bg-panel text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-ink-muted hover:text-ink",
            )}
          >
            {Icon && <Icon className="size-3.5" strokeWidth={1.75} />}
            {(!Icon || value === option.value) && option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  onEnter,
  placeholder = "Search",
  className,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: (backwards: boolean) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="search"
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter?.(event.shiftKey);
        }
        if (event.key === "Escape") onChange("");
      }}
      className={cn(
        "h-8 w-36 shrink-0 rounded-lg border border-line bg-panel px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-ink-soft sm:w-52",
        className,
      )}
    />
  );
}

/** Centered message for loading, empty and failed states. */
export function ViewerStatus({
  title,
  detail,
  loading,
  tone = "neutral",
  children,
}: {
  title: string;
  detail?: ReactNode;
  loading?: boolean;
  tone?: "neutral" | "error";
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {loading && <LoaderCircle className="size-5 animate-spin text-ink-faint" strokeWidth={1.75} />}
      <p className={cn("text-[15px] font-medium", tone === "error" ? "text-breach" : "text-ink")}>{title}</p>
      {detail && <div className="max-w-md text-[13px] leading-relaxed text-ink-soft">{detail}</div>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

const pendingRevokes = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * An object URL for the blob, revoked once nothing shows it. Revoking is
 * deferred a beat so a remount that keeps the same blob keeps the same URL.
 */
export function useBlobUrl(blob: Blob | undefined | null): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => {
    if (!url) return;
    clearTimeout(pendingRevokes.get(url));
    pendingRevokes.delete(url);
    return () => {
      pendingRevokes.set(
        url,
        setTimeout(() => {
          pendingRevokes.delete(url);
          URL.revokeObjectURL(url);
        }, 1000),
      );
    };
  }, [url]);
  return url;
}

export type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; error: Error };

/**
 * Runs an async load keyed on `deps`, and drops the result if the deps moved
 * on before it finished — switching docs mid-parse never paints the old one.
 */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Loaded<T> {
  const [settled, setSettled] = useState<{ deps: unknown[]; result: Loaded<T> }>();
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (value) => !controller.signal.aborted && setSettled({ deps, result: { status: "ready", value } }),
      (error: unknown) =>
        !controller.signal.aborted &&
        setSettled({
          deps,
          result: { status: "error", error: error instanceof Error ? error : new Error(String(error)) },
        }),
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  // A result for older deps is as good as none: the new load is still running.
  const current = settled && settled.deps.length === deps.length && settled.deps.every((dep, i) => Object.is(dep, deps[i]));
  return current ? settled.result : { status: "loading" };
}

/** Text of a blob, decoded as UTF-8, or UTF-16 when it carries a BOM. */
export async function readText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** A failed load, with the reason and a way out to a viewer that cannot fail. */
export function LoadFailed({ error, what = "this file" }: { error: Error; what?: string }) {
  return (
    <ViewerStatus
      tone="error"
      title={`Couldn't open ${what}`}
      detail={
        <>
          <span className="readout block break-words text-[12px] text-ink-muted">{error.message}</span>
          <span className="mt-2 block">Try “View as” in the bar above to read it another way.</span>
        </>
      }
    />
  );
}
