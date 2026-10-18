import { strFromU8, unzipSync } from "fflate";

/** Slides are laid out at this width and scaled by CSS, so text keeps its proportions at any size. */
export const SLIDE_WIDTH = 960;

export interface Deck {
  width: number;
  height: number;
  slides: HTMLElement[];
  /** Copies for the thumbnail rail; a DOM node can only stand in one place. */
  thumbnails: HTMLElement[];
  /** True when pptx-preview failed and the slides are a text-and-pictures reconstruction. */
  simplified: boolean;
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Renders every slide with pptx-preview into an off-screen host that is in
 * the document — its charts size themselves on a timer and need real layout —
 * then lifts the slide elements out for the viewer to place.
 */
async function renderWithPreviewer(buffer: ArrayBuffer, signal: AbortSignal): Promise<Deck> {
  const { init } = await import("pptx-preview");
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${SLIDE_WIDTH}px;visibility:hidden;pointer-events:none`;
  document.body.append(host);
  const previewer = init(host, { width: SLIDE_WIDTH, mode: "list" });
  signal.addEventListener("abort", () => previewer.destroy(), { once: true });
  try {
    const pptx = await previewer.load(buffer);
    const height = Math.round((SLIDE_WIDTH * pptx.height) / pptx.width);
    const slides: HTMLElement[] = [];
    for (let index = 0; index < pptx.slides.length; index++) {
      if (signal.aborted) throw signal.reason;
      previewer.htmlRender.renderSlide(index);
      const slide = previewer.wrapper.lastElementChild as HTMLElement;
      slide.style.margin = "0";
      slides.push(slide);
      // Yield now and then, so a long deck doesn't freeze the page.
      if (index % 8 === 7) await tick();
    }
    await tick(60);
    if (signal.aborted) throw signal.reason;
    slides.forEach((slide) => slide.remove());
    return {
      width: SLIDE_WIDTH,
      height,
      slides,
      thumbnails: slides.map((slide) => slide.cloneNode(true) as HTMLElement),
      simplified: false,
    };
  } finally {
    host.remove();
  }
}

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function resolvePath(base: string, target: string) {
  const parts = base.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

function imageType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp" }[extension];
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Reads each slide's text and pictures straight from the package, in presentation order. */
function reconstruct(buffer: ArrayBuffer): Deck {
  const files = unzipSync(new Uint8Array(buffer));
  const xml = (path: string) => (files[path] ? new DOMParser().parseFromString(strFromU8(files[path]), "application/xml") : null);
  const relations = (path: string) => {
    const rels = xml(path.replace(/([^/]+)$/, "_rels/$1.rels"));
    return new Map([...(rels?.getElementsByTagName("Relationship") ?? [])].map((rel) => [rel.getAttribute("Id")!, rel]));
  };

  const presentation = xml("ppt/presentation.xml");
  const size = presentation?.getElementsByTagNameNS(P, "sldSz")[0];
  const aspect = size ? Number(size.getAttribute("cy")) / Number(size.getAttribute("cx")) || 9 / 16 : 9 / 16;
  const presentationRels = relations("ppt/presentation.xml");
  let paths = [...(presentation?.getElementsByTagNameNS(P, "sldId") ?? [])]
    .map((id) => presentationRels.get(id.getAttributeNS(R, "id") ?? "")?.getAttribute("Target"))
    .filter((target): target is string => !!target)
    .map((target) => resolvePath("ppt/presentation.xml", target));
  if (paths.length === 0) {
    paths = Object.keys(files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  }

  const height = Math.round(SLIDE_WIDTH * aspect);
  const slides = paths.map((path) => {
    const slide = document.createElement("div");
    slide.style.cssText = `width:${SLIDE_WIDTH}px;height:${height}px;background:#fff;color:#151a18;overflow:hidden;padding:48px 56px;box-sizing:border-box;font:22px/1.4 system-ui,sans-serif;display:flex;flex-direction:column;gap:14px`;
    const source = xml(path);
    if (!source) return slide;
    const paragraphs = [...source.getElementsByTagNameNS(A, "p")]
      .map((paragraph) => [...paragraph.getElementsByTagNameNS(A, "t")].map((run) => run.textContent).join(""))
      .filter((text) => text.trim());
    paragraphs.forEach((text, index) => {
      const line = document.createElement(index === 0 ? "h2" : "p");
      line.textContent = text;
      line.style.cssText = index === 0 ? "margin:0 0 8px;font-size:38px;font-weight:600;line-height:1.15" : "margin:0";
      slide.append(line);
    });
    const rels = relations(path);
    const pictures = document.createElement("div");
    pictures.style.cssText = "display:flex;gap:16px;min-height:0;flex:1;align-items:center;justify-content:center";
    for (const blip of source.getElementsByTagNameNS(A, "blip")) {
      const target = rels.get(blip.getAttributeNS(R, "embed") ?? "")?.getAttribute("Target");
      const media = target && resolvePath(path, target);
      const type = media && imageType(media);
      if (!media || !type || !files[media]) continue;
      const image = document.createElement("img");
      image.src = `data:${type};base64,${base64(files[media])}`;
      image.alt = "";
      image.style.cssText = "max-height:100%;max-width:100%;object-fit:contain;min-width:0";
      pictures.append(image);
    }
    if (pictures.childElementCount) slide.append(pictures);
    return slide;
  });

  return {
    width: SLIDE_WIDTH,
    height,
    slides,
    thumbnails: slides.map((slide) => slide.cloneNode(true) as HTMLElement),
    simplified: true,
  };
}

export async function renderDeck(blob: Blob, signal: AbortSignal): Promise<Deck> {
  const buffer = await blob.arrayBuffer();
  try {
    const deck = await renderWithPreviewer(buffer.slice(0), signal);
    if (deck.slides.length) return deck;
  } catch (error) {
    if (signal.aborted) throw error;
  }
  const deck = reconstruct(buffer);
  if (deck.slides.length === 0) throw new Error("No slides found in this presentation");
  return deck;
}
