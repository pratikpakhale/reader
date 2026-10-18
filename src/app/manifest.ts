import type { MetadataRoute } from "next";
import { FAMILIES, extensionsFor } from "@/lib/formats/registry";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/site";

/**
 * Installed, the reader registers as a handler for every format it knows, so
 * "Open with → Reader." works from the desktop. `file_handlers` is not in
 * Next's manifest type yet, hence the widening.
 */
export default function manifest(): MetadataRoute.Manifest {
  const accept: Record<string, string[]> = {
    "application/octet-stream": FAMILIES.flatMap((family) => extensionsFor(family.id)).map((ext) => `.${ext}`),
  };
  return {
    name: `${SITE_NAME} — ${SITE_TITLE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0f0e",
    theme_color: "#0b0f0e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    ...({ file_handlers: [{ action: "/", accept }], launch_handler: { client_mode: "focus-existing" } } as object),
  };
}
