import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "./site";

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };
export const SOCIAL_IMAGE_TYPE = "image/png";
export const SOCIAL_IMAGE_ALT = `${SITE_NAME} — ${SITE_TAGLINE} Read documents, spreadsheets, slides, books, images, media, code, archives and 3D models entirely in your browser.`;

const BENCH = "#0b0f0e";
const INK = "#f3f5f3";
const MUTED = "#6d7a74";
const LAMP = "#35e08f";

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#141a18" />
      <path d="M10.6 3.2h7.6l4.6 4.6v13.9a1.5 1.5 0 0 1-1.5 1.5H10.6a1.5 1.5 0 0 1-1.5-1.5V4.7a1.5 1.5 0 0 1 1.5-1.5Z" fill="#515c57" />
      <path d="M7.1 6.6h8.1l4.9 4.9v14.4a1.6 1.6 0 0 1-1.6 1.6H7.1a1.6 1.6 0 0 1-1.6-1.6V8.2a1.6 1.6 0 0 1 1.6-1.6Z" fill={INK} />
      <path d="M15.2 6.6l4.9 4.9h-4.9V6.6Z" fill="#b7c0bb" />
      <circle cx="23.6" cy="23.6" r="5.6" fill="#141a18" />
      <circle cx="23.6" cy="23.6" r="4" fill={LAMP} />
    </svg>
  );
}

const SHELF = ["PDF", "DOCX", "XLSX", "PPTX", "EPUB", "HEIC", "MP4", "ZIP", "RAR", "GLB", "SQLITE", "IPYNB"];

export function renderSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BENCH,
          color: INK,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Mark size={64} />
          <div style={{ display: "flex", fontSize: 44, letterSpacing: "-0.03em" }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", fontSize: 96, lineHeight: 1.02, letterSpacing: "-0.04em", maxWidth: 1000 }}>
            {SITE_TAGLINE}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, maxWidth: 1000 }}>
            {SHELF.map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  fontSize: 22,
                  letterSpacing: "0.12em",
                  color: MUTED,
                  border: "1px solid #272f2c",
                  borderRadius: 999,
                  padding: "8px 18px",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    SOCIAL_IMAGE_SIZE,
  );
}
