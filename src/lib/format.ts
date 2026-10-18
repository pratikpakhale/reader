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
