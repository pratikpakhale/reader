"use client";

import { FAMILY_ICONS } from "@/components/shell/doc-icon";
import { acceptFor, type Family } from "@/lib/formats/registry";
import { pickFiles } from "@/lib/library/intake";

/** A door into the same reader, with the picker narrowed to one family. */
export function FamilyDoor({
  family,
  name,
  blurb,
  kinds,
  count,
}: {
  family: Family;
  name: string;
  blurb: string;
  kinds: string[];
  count: number;
}) {
  const Icon = FAMILY_ICONS[family];
    return (
    <button
      type="button"
      onClick={() => pickFiles(acceptFor(family))}
      className="group flex h-full w-full flex-col justify-between gap-6 bg-panel p-4 sm:gap-8 sm:p-5 text-left transition-colors hover:bg-panel-hover"
    >
      <Icon className="size-6 text-ink-faint transition-colors group-hover:text-ink" strokeWidth={1.25} />
      <span>
        <span className="block text-[15px] font-semibold text-ink">{name}</span>
        <span className="mt-1 block text-[13px] text-ink-soft max-sm:hidden">{blurb}</span>
        <span className="etch mt-3 block text-[9px] leading-[1.7] text-ink-faint sm:mt-4">
          {kinds.join(" · ")}
          <span className="max-sm:hidden"> · {count} extensions</span>
        </span>
      </span>
    </button>
  );
}
