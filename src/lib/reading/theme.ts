"use client";

import { useSyncExternalStore } from "react";

export type AppTheme = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const read = (): AppTheme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** The app's resolved theme, for content drawn outside Tailwind's reach (book frames, canvases). */
export function useAppTheme(): AppTheme {
  return useSyncExternalStore(subscribe, read, () => "light");
}
