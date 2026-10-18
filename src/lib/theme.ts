export const THEME_KEY = "reader-theme";

/**
 * Runs before first paint so the bench is never painted light and then
 * repainted dark. Resolving the system preference to a literal here is also
 * what keeps the stylesheet down to a single dark block.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.dataset.theme=t==="dark"||t==="light"?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}`;
