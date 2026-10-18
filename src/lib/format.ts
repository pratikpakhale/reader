const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const tier = Math.min(
    UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** tier;
  const digits = tier === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[tier]}`;
}

export function formatDelta(before: number, after: number) {
  if (before <= 0) return "0%";
  const change = Math.round((1 - after / before) * 100);
  return change >= 0 ? `${change}% smaller` : `${Math.abs(change)}% larger`;
}

/** Images arrive as sources under their own name, so .jpg counts as much as .pdf. */
export function stripExtension(name: string) {
  return name.replace(/\.(pdf|jpe?g|png)$/i, "");
}
