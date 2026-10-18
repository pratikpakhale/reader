"use client";

import { useEffect } from "react";
import { openFiles, pickFiles } from "@/lib/library/intake";

interface LaunchParams {
  files: FileSystemFileHandle[];
}
declare global {
  interface Window {
    launchQueue?: { setConsumer: (consumer: (params: LaunchParams) => void) => void };
  }
}

function editing(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

/** The ways in that aren't a click: paste, the installed app's "Open with", and ⌘O. */
export function IntakeListeners() {
  useEffect(() => {
    window.launchQueue?.setConsumer(async ({ files }) => {
      openFiles(await Promise.all(files.map((handle) => handle.getFile())));
    });

    const paste = (event: ClipboardEvent) => {
      if (editing(event.target)) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length > 0) {
        event.preventDefault();
        openFiles(files.map((file, index) =>
          // Pasted screenshots all arrive as "image.png".
          file.name === "image.png" ? new File([file], `Pasted ${new Date().toLocaleTimeString()}${index ? ` ${index + 1}` : ""}.png`, { type: file.type }) : file,
        ));
      }
    };

    const keys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        pickFiles();
      }
    };

    document.addEventListener("paste", paste);
    window.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("paste", paste);
      window.removeEventListener("keydown", keys);
    };
  }, []);

  return null;
}
