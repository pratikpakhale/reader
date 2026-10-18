import { readText } from "@/components/viewer-kit";
import { formatBytes } from "@/lib/format";
import type { Doc } from "@/lib/library/types";
import { extensionOf } from "@/lib/formats/registry";
import { isKnownLanguage } from "@/lib/highlight/shiki";

/** More text than this is cut short: past it a browser tab runs out of room to hold and lay it out. */
export const TEXT_LIMIT = 64 * 1024 * 1024;

/**
 * The text of a blob, or its first TEXT_LIMIT bytes cut at a line break, so a
 * multi-gigabyte log opens at its head instead of failing outright.
 */
export async function readTextCapped(blob: Blob): Promise<{ text: string; notice?: string }> {
  if (blob.size <= TEXT_LIMIT) return { text: await readText(blob) };
  const head = new Uint8Array(await blob.slice(0, TEXT_LIMIT).arrayBuffer());
  const cut = head.lastIndexOf(0x0a);
  const text = await readText(new Blob([cut > 0 ? head.subarray(0, cut) : head]));
  return { text, notice: `First ${formatBytes(TEXT_LIMIT)} of ${formatBytes(blob.size)}` };
}

/** The grammar a doc reads in: its format's, else its extension's, else its format id. */
export function languageOf(doc: Doc): string {
  const declared = doc.format.language;
  if (declared && declared !== "text") return declared;
  if (doc.format.id === "notebook") return "json";
  const extension = extensionOf(doc.name);
  if (isKnownLanguage(extension)) return extension;
  if (isKnownLanguage(doc.format.id)) return doc.format.id;
  return "text";
}
