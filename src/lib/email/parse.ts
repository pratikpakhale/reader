import PostalMime, { type Address, type Attachment } from "postal-mime";
import DOMPurify from "dompurify";

interface EmailAttachment {
  name: string;
  size: number;
  blob: Blob;
}

export interface ParsedEmail {
  subject: string;
  from: string[];
  to: string[];
  cc: string[];
  date?: Date;
  /** A sanitised, self-contained document for a sandboxed frame. */
  html?: string;
  text?: string;
  attachments: EmailAttachment[];
}

interface Resource {
  mimeType: string;
  content: ArrayBuffer | Uint8Array | string;
}

/** The parts of postal-mime's MIME tree we read; it is not in the published types. */
interface MimeNode {
  headers?: Array<{ key: string; value: string }>;
  contentType?: { parsed?: { value?: string } };
  content?: ArrayBuffer | null;
  childNodes?: MimeNode[];
}

// Belt and braces over the app's own CSP, which a srcdoc frame inherits.
const FRAME_CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">`;
const FRAME_BASE = `<style>html{color-scheme:light}body{margin:0;padding:24px;font:15px/1.5 system-ui,sans-serif;color:#151a18;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>`;
const REMOTE = /^\s*(https?:)?\/\//i;
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

function formatAddresses(addresses: Address[] | Address | undefined): string[] {
  const list = Array.isArray(addresses) ? addresses : addresses ? [addresses] : [];
  return list.flatMap((entry) => {
    if (entry.group) return entry.group.map((member) => formatMailbox(member.name, member.address));
    return [formatMailbox(entry.name, entry.address ?? "")];
  });
}

function formatMailbox(name: string, address: string) {
  return name && address ? `${name} <${address}>` : name || address;
}

function toBytes(content: Resource["content"]): Uint8Array<ArrayBuffer> {
  if (typeof content === "string") return new TextEncoder().encode(content);
  return new Uint8Array(content instanceof Uint8Array ? content.slice() : content);
}

function dataUrl(resource: Resource) {
  const bytes = toBytes(resource.content);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${resource.mimeType || "application/octet-stream"};base64,${btoa(binary)}`;
}

function extension(mimeType: string) {
  const subtype = mimeType.split("/")[1] ?? "bin";
  return { jpeg: "jpg", plain: "txt", "svg+xml": "svg", "octet-stream": "bin" }[subtype] ?? subtype.replace(/[^a-z0-9]/gi, "");
}

/** Saved web pages (.mht) point at their parts by Content-Location rather than cid:. */
function collectLocations(node: MimeNode | undefined, into = new Map<string, Resource>()) {
  if (!node) return into;
  const location = node.headers?.find((header) => header.key === "content-location")?.value.trim();
  if (location && node.content) {
    into.set(location, { mimeType: node.contentType?.parsed?.value ?? "", content: node.content });
  }
  node.childNodes?.forEach((child) => collectLocations(child, into));
  return into;
}

/**
 * Inlines every part the HTML refers to as data: URLs and sanitises the
 * result, so the frame needs nothing from the network or from us.
 */
function prepareHtml(html: string, resolve: (reference: string) => Resource | undefined) {
  const page = new DOMParser().parseFromString(html, "text/html");
  const used = new Set<Resource>();

  const inline = (reference: string) => {
    const resource = resolve(reference.trim());
    if (!resource) return undefined;
    used.add(resource);
    return dataUrl(resource);
  };
  const rewriteCss = (css: string) => css.replace(CSS_URL, (match, _, url: string) => {
    const inlined = inline(url);
    return inlined ? `url("${inlined}")` : match;
  });

  page.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet'][href]").forEach((link) => {
    const resource = resolve(link.getAttribute("href")!.trim());
    if (resource) {
      used.add(resource);
      const style = page.createElement("style");
      style.textContent = rewriteCss(new TextDecoder().decode(toBytes(resource.content)));
      link.replaceWith(style);
    }
  });
  page.querySelectorAll("style").forEach((style) => (style.textContent = rewriteCss(style.textContent ?? "")));
  page.querySelectorAll<HTMLElement>("[style]").forEach((element) =>
    element.setAttribute("style", rewriteCss(element.getAttribute("style")!)),
  );
  page.querySelectorAll("[src], [background]").forEach((element) => {
    for (const attribute of ["src", "background"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const inlined = inline(value);
      if (inlined) element.setAttribute(attribute, inlined);
      // A blocked remote picture would only draw as a broken-image icon.
      else if (REMOTE.test(value)) element.removeAttribute(attribute);
    }
  });
  page.querySelectorAll("a[href]").forEach((anchor) => {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  });

  const clean = DOMPurify.sanitize(page.documentElement.outerHTML, {
    WHOLE_DOCUMENT: true,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["form", "input", "button", "textarea", "select"],
  });
  const framed = /<head[^>]*>/i.test(clean)
    ? clean.replace(/<head[^>]*>/i, (head) => `${head}${FRAME_CSP}${FRAME_BASE}`)
    : `${FRAME_CSP}${FRAME_BASE}${clean}`;
  // Standards mode, so the page's height is its content's rather than the frame's.
  return { html: `<!doctype html>${framed}`, used };
}

export async function parseEmail(blob: Blob): Promise<ParsedEmail> {
  const parser = new PostalMime();
  const email = await parser.parse(blob);

  const byCid = new Map<string, Attachment>();
  for (const attachment of email.attachments) {
    if (attachment.contentId) byCid.set(attachment.contentId.replace(/^<|>$/g, ""), attachment);
  }
  const byLocation = collectLocations((parser as unknown as { root?: MimeNode }).root);
  const contentToAttachment = new Map(email.attachments.map((attachment) => [attachment.content, attachment]));

  let prepared: ReturnType<typeof prepareHtml> | undefined;
  if (email.html) {
    prepared = prepareHtml(email.html, (reference) => {
      if (/^cid:/i.test(reference)) return byCid.get(decodeURIComponent(reference.slice(4)).replace(/^<|>$/g, ""));
      return byLocation.get(reference);
    });
  }
  // A part the page drew inline is part of the page, not something to open.
  const inlined = new Set<unknown>();
  prepared?.used.forEach((resource) => {
    inlined.add(resource);
    inlined.add(contentToAttachment.get(resource.content));
  });

  const date = email.date ? new Date(email.date) : undefined;
  return {
    subject: email.subject?.trim() || "(no subject)",
    from: formatAddresses(email.from),
    to: formatAddresses(email.to),
    cc: formatAddresses(email.cc),
    date: date && !isNaN(date.getTime()) ? date : undefined,
    html: prepared?.html,
    text: email.text,
    attachments: email.attachments
      .filter((attachment) => !inlined.has(attachment))
      .map((attachment, index) => {
        const bytes = toBytes(attachment.content);
        return {
          name: attachment.filename || `attachment-${index + 1}.${extension(attachment.mimeType)}`,
          size: bytes.byteLength,
          blob: new Blob([bytes], { type: attachment.mimeType }),
        };
      }),
  };
}
