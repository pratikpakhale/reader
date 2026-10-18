"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "solid" | "outline" | "quiet" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  solid:
    "bg-fill text-on-fill hover:bg-fill-hover disabled:hover:bg-fill",
  outline:
    "border border-line-strong bg-panel text-ink hover:border-ink disabled:hover:border-line-strong",
  quiet: "text-ink-muted hover:bg-line/60 hover:text-ink",
  danger: "text-breach hover:bg-breach/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-full px-3 text-[13px]",
  md: "h-10 gap-2 rounded-full px-4 text-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
  }
>(function Button(
  { className, variant = "solid", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
