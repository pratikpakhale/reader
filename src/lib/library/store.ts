"use client";

import { create } from "zustand";
import type { ViewerId } from "@/lib/formats/registry";
import { detect } from "@/lib/formats/sniff";
import { remember } from "./recents";
import type { Doc, Incoming } from "./types";

interface Library {
  docs: Doc[];
  activeId: string | null;
  /** True while files are being sniffed, so the shell can say so. */
  opening: number;

  open: (files: Array<File | Incoming>, options?: { parentId?: string; activate?: boolean }) => Promise<Doc[]>;
  close: (id: string) => void;
  closeAll: () => void;
  activate: (id: string) => void;
  step: (delta: 1 | -1) => void;
  viewAs: (id: string, viewer: ViewerId | undefined) => void;
}

function toIncoming(file: File | Incoming): Incoming {
  return file instanceof File
    ? { blob: file, name: file.name, lastModified: file.lastModified }
    : file;
}

/** A doc and everything that came out of it, however deep. */
function lineage(docs: Doc[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const doc of docs) {
      if (doc.parentId && ids.has(doc.parentId) && !ids.has(doc.id)) {
        ids.add(doc.id);
        grew = true;
      }
    }
  }
  return ids;
}

export const useLibrary = create<Library>()((set, get) => ({
  docs: [],
  activeId: null,
  opening: 0,

  open: async (files, { parentId, activate = true } = {}) => {
    const incoming = files.map(toIncoming);
    if (incoming.length === 0) return [];
    set((state) => ({ opening: state.opening + 1 }));
    try {
      const fresh = await Promise.all(
        incoming.map(async (file): Promise<Doc> => ({
          id: crypto.randomUUID(),
          name: file.name.split("/").pop() || file.name,
          size: file.blob.size,
          blob: file.blob,
          format: await detect(file.blob, file.name),
          parentId,
          path: file.path,
          lastModified: file.lastModified,
        })),
      );

      set((state) => {
        // Opening a file that is already open, from the same place, focuses it
        // instead of stacking a duplicate on the shelf.
        const added: Doc[] = [];
        let focus: string | null = null;
        for (const doc of fresh) {
          const twin = state.docs.find(
            (open) =>
              open.name === doc.name &&
              open.size === doc.size &&
              open.parentId === doc.parentId &&
              open.path === doc.path,
          );
          if (twin) focus ??= twin.id;
          else {
            added.push(doc);
            focus ??= doc.id;
          }
        }

        // Children sit right after their parent on the shelf.
        const docs = [...state.docs];
        const at = parentId ? docs.findIndex((doc) => doc.id === parentId) : -1;
        if (at >= 0) {
          let end = at + 1;
          const family = lineage(docs, parentId!);
          while (end < docs.length && family.has(docs[end].id)) end += 1;
          docs.splice(end, 0, ...added);
        } else {
          docs.push(...added);
        }

        return {
          docs,
          activeId: activate ? focus : state.activeId ?? focus,
        };
      });

      if (!parentId) void remember(fresh);
      return fresh;
    } finally {
      set((state) => ({ opening: state.opening - 1 }));
    }
  },

  close: (id) =>
    set((state) => {
      const gone = lineage(state.docs, id);
      const index = state.docs.findIndex((doc) => doc.id === id);
      const docs = state.docs.filter((doc) => !gone.has(doc.id));
      let activeId = state.activeId;
      if (activeId && gone.has(activeId)) {
        const parent = state.docs[index]?.parentId;
        activeId =
          (parent && docs.some((doc) => doc.id === parent) ? parent : null) ??
          docs[Math.min(index, docs.length - 1)]?.id ??
          null;
      }
      return { docs, activeId };
    }),

  closeAll: () => set({ docs: [], activeId: null }),

  activate: (id) => set({ activeId: id }),

  step: (delta) => {
    const { docs, activeId } = get();
    if (docs.length < 2) return;
    const index = docs.findIndex((doc) => doc.id === activeId);
    const next = docs[(index + delta + docs.length) % docs.length];
    set({ activeId: next.id });
  },

  viewAs: (id, viewer) =>
    set((state) => ({
      docs: state.docs.map((doc) => (doc.id === id ? { ...doc, viewAs: viewer } : doc)),
    })),
}));

export function useActiveDoc(): Doc | undefined {
  return useLibrary((state) => state.docs.find((doc) => doc.id === state.activeId));
}

/** For viewers that hold files inside them — archives, emails, notebooks. */
export function openNested(parent: Doc, files: Incoming[]) {
  return useLibrary.getState().open(files, { parentId: parent.id });
}
