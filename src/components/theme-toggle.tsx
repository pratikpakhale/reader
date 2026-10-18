"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_KEY } from "@/lib/theme";

/**
 * Which icon shows is decided in CSS from the attribute the pre-paint script
 * set, so there is no state to hydrate and nothing to flicker.
 */
export function ThemeToggle() {
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (localStorage.getItem(THEME_KEY)) return;
      document.documentElement.dataset.theme = system.matches ? "dark" : "light";
    };
    system.addEventListener("change", follow);
    return () => system.removeEventListener("change", follow);
  }, []);

  const flip = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      title="Switch theme"
      className="flex size-7 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Sun className="size-3.5 dark:hidden" strokeWidth={1.75} />
      <Moon className="hidden size-3.5 dark:block" strokeWidth={1.75} />
      <span className="sr-only">Switch theme</span>
    </button>
  );
}
