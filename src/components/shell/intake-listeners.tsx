"use client";

import { useEffect } from "react";
import { openFiles, pickFiles } from "@/lib/library/intake";
import { useLibrary } from "@/lib/library/store";

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

/**
 * The ways in that aren't a click: pasting a file, the OS "Open with" for an
 * installed app, and the keyboard.
 */
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
        return;
      }
      const text = event.clipboardData?.getData("text/plain");
      if (text && text.length > 0 && useLibrary.getState().docs.length === 0) {
        event.preventDefault();
        openFiles([new File([text], "Pasted text.txt", { type: "text/plain" })]);
      }
    };

    const keys = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        pickFiles();
        return;
      }
      if (editing(event.target)) return;
      if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        useLibrary.getState().step(event.key === "ArrowDown" ? 1 : -1);
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
