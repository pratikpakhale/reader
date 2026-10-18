"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Paperclip } from "lucide-react";
import type { Doc, ViewerProps } from "@/lib/library/types";
import { openNested } from "@/lib/library/store";
import { formatBytes } from "@/lib/format";
import { LoadFailed, useLoad, ViewerFrame, ViewerStatus } from "@/components/viewer-kit";
import { parseEmail, type ParsedEmail } from "@/lib/email/parse";

const LINK = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

function Linkified({ text }: { text: string }) {
  return text.split(LINK).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-seal-ink underline underline-offset-2">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/**
 * The HTML body, in a frame that may never run script. `allow-same-origin`
 * without `allow-scripts` is what lets us measure it to its full height, so
 * the message scrolls as one page with its headers.
 */
function HtmlBody({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);

  useEffect(() => {
    const element = frame.current!;
    let observer: ResizeObserver | undefined;
    const attach = () => {
      const root = element.contentDocument?.documentElement;
      if (!root) return;
      // The root's own box, not scrollHeight, which never reports less than the frame's current height.
      const measure = () => setHeight(Math.max(120, Math.ceil(root.getBoundingClientRect().height)));
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(root);
      measure();
    };
    element.addEventListener("load", attach);
    // The srcdoc may finish loading before this effect runs.
    if (element.contentDocument?.readyState === "complete" && element.contentWindow?.location.href === "about:srcdoc") attach();
    return () => {
      element.removeEventListener("load", attach);
      observer?.disconnect();
    };
  }, []);

  return (
    <iframe
      ref={frame}
      title="Message body"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={html}
      className="block w-full border-0 bg-sheet"
      style={{ height }}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="etch pt-[3px] text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-ink-muted">{children}</dd>
    </>
  );
}

function Message({ doc, email }: { doc: Doc; email: ParsedEmail }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-sunken">
      <article className="mx-auto max-w-[56rem] px-3 py-4 sm:px-6 sm:py-8">
        <header className="px-1 pb-5">
          <h1 className="headline text-[24px] break-words text-ink sm:text-[30px]">{email.subject}</h1>
          <dl className="mt-4 grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            {email.from.length > 0 && <Field label="From">{email.from.join(", ")}</Field>}
            {email.to.length > 0 && <Field label="To">{email.to.join(", ")}</Field>}
            {email.cc.length > 0 && <Field label="Cc">{email.cc.join(", ")}</Field>}
            {email.date && (
              <Field label="Date">
                <time dateTime={email.date.toISOString()} className="readout text-[12px]">
                  {email.date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </Field>
            )}
          </dl>
          {email.attachments.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Attachments">
              {email.attachments.map((attachment, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => openNested(doc, [{ blob: attachment.blob, name: attachment.name }])}
                    title={`Open ${attachment.name}`}
                    className="inline-flex h-8 max-w-72 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[12px] text-ink transition-colors hover:border-line-strong hover:bg-panel-hover"
                  >
                    <Paperclip className="size-3.5 shrink-0 text-ink-soft" strokeWidth={1.75} />
                    <span className="truncate font-medium">{attachment.name}</span>
                    <span className="readout shrink-0 text-[11px] text-ink-faint">{formatBytes(attachment.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </header>

        <div className="overflow-hidden rounded-panel bg-sheet shadow-[0_1px_3px_rgb(0_0_0/0.12),0_12px_40px_-12px_rgb(0_0_0/0.25)]">
          {email.html ? (
            <HtmlBody html={email.html} />
          ) : email.text ? (
            <div className="px-6 py-6 font-sans text-[14px] leading-relaxed break-words whitespace-pre-wrap text-steel-900">
              <Linkified text={email.text} />
            </div>
          ) : (
            <p className="px-6 py-10 text-center text-[13px] text-steel-900/50">This message has no body.</p>
          )}
        </div>
      </article>
    </div>
  );
}

export default function EmailViewer({ doc }: ViewerProps) {
  const state = useLoad(() => parseEmail(doc.blob), [doc.id]);
  return (
    <ViewerFrame>
      {state.status === "loading" ? (
        <ViewerStatus loading title="Reading message" />
      ) : state.status === "error" ? (
        <LoadFailed error={state.error} what="this message" />
      ) : (
        <Message doc={doc} email={state.value} />
      )}
    </ViewerFrame>
  );
}
