"use client";

import { clear, createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import type { Doc } from "./types";

/**
 * Recently opened files are kept in this browser's IndexedDB, and nowhere
 * else. They are stored whole so a recent opens offline, exactly as it was.
 */

export interface Recent {
  id: string;
  name: string;
  size: number;
  formatId: string;
  openedAt: number;
}

const KEEP = 24;
/** Larger files are listed only while open; storing them would fill the quota. */
const LARGEST = 150 * 1024 * 1024;

// One store per database is all idb-keyval allows, hence two databases.
let stores: { meta: UseStore; blobs: UseStore } | undefined;
const opened = () =>
  (stores ??= {
    meta: createStore("reader-recents", "meta"),
    blobs: createStore("reader-blobs", "blobs"),
  });
const meta = () => opened().meta;
const blobs = () => opened().blobs;

const listeners = new Set<() => void>();
export function onRecentsChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const changed = () => listeners.forEach((listener) => listener());

export async function listRecents(): Promise<Recent[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await entries<string, Recent>(meta());
  return all.map(([, recent]) => recent).sort((a, b) => b.openedAt - a.openedAt);
}

export async function remember(docs: Doc[]) {
  if (typeof indexedDB === "undefined") return;
  try {
    const existing = await listRecents();
    for (const doc of docs) {
      if (doc.size > LARGEST) continue;
      const twin = existing.find((r) => r.name === doc.name && r.size === doc.size);
      const id = twin?.id ?? doc.id;
      await set(id, { id, name: doc.name, size: doc.size, formatId: doc.format.id, openedAt: Date.now() } satisfies Recent, meta());
      if (!twin) await set(id, doc.blob, blobs());
    }
    const stale = (await listRecents()).slice(KEEP);
    for (const recent of stale) await forget(recent.id, false);
    changed();
  } catch {
    // Private mode or a full disk: recents are a convenience, never a blocker.
  }
}

export async function recall(recent: Recent): Promise<File | undefined> {
  const blob = await get<Blob>(recent.id, blobs());
  if (!blob) return undefined;
  await set(recent.id, { ...recent, openedAt: Date.now() }, meta());
  changed();
  return new File([blob], recent.name, { type: blob.type });
}

export async function forget(id: string, notify = true) {
  await del(id, meta());
  await del(id, blobs());
  if (notify) changed();
}

export async function forgetAll() {
  await clear(meta());
  await clear(blobs());
  changed();
}
