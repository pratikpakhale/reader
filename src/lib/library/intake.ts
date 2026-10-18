"use client";

import { useLibrary } from "./store";
import type { Incoming } from "./types";

/**
 * Every way a file can arrive — picker, drop, paste, the OS "Open with" — ends
 * here, so they all behave the same.
 */
export function openFiles(files: Iterable<File | Incoming> | null | undefined) {
  if (!files) return;
  const list = [...files];
  if (list.length > 0) void useLibrary.getState().open(list);
}

/** Opens the system picker from code, so there is no hidden input to keep in the tree. */
export function pickFiles() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.addEventListener("change", () => openFiles(input.files), { once: true });
  input.click();
}

const FOLDER_LIMIT = 2000;

async function readEntry(entry: FileSystemEntry, out: Incoming[]): Promise<void> {
  if (out.length >= FOLDER_LIMIT) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ blob: file, name: file.name, path: entry.fullPath.replace(/^\//, "") });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries hands back at most ~100 at a time; keep asking until empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      for (const child of batch) {
        if (!child.name.startsWith(".")) await readEntry(child, out);
      }
    }
  }
}

/** Dropped folders are walked, so a folder of photos opens as photos. */
export async function filesFromDrop(transfer: DataTransfer): Promise<Incoming[] | File[]> {
  const entries = [...transfer.items]
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry?.() : null))
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!entries.some((entry) => entry.isDirectory)) return [...transfer.files];
  const out: Incoming[] = [];
  for (const entry of entries) await readEntry(entry, out);
  return out;
}
