import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * `connect-src 'self'` and `form-action 'none'` are the product, not hardening:
 * they make "your files never leave this tab" enforced by the browser rather
 * than merely claimed by us. Everything else opens exactly as wide as a viewer
 * needs to draw a local file, and no wider.
 */
const csp = [
  "default-src 'self'",
  // pdf.js, libarchive, SQLite and the image decoders are WebAssembly.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  // EPUB and Word documents bring their own stylesheets, served from blob: URLs.
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  // Web pages, books and emails are drawn in sandboxed frames.
  "frame-src 'self' blob: data:",
  "child-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
]
  .join("; ")
  .concat(isDev ? "" : "; upgrade-insecure-requests");

const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
