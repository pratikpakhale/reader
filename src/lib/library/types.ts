import type { Format, ViewerId } from "@/lib/formats/registry";

/**
 * One file open in the reader. A doc found inside an archive carries the
 * archive's id as its parent, so closing the archive closes what came out of it.
 */
export interface Doc {
  id: string;
  name: string;
  size: number;
  blob: Blob;
  format: Format;
  /** The viewer the user picked over the detected one, from "View as". */
  viewAs?: ViewerId;
  parentId?: string;
  /** Where the doc sat inside its parent archive. */
  path?: string;
  lastModified?: number;
}

/** What every viewer is handed. Viewers fill their parent and own their scroll. */
export interface ViewerProps {
  doc: Doc;
}

export interface Incoming {
  blob: Blob;
  name: string;
  path?: string;
  lastModified?: number;
}
