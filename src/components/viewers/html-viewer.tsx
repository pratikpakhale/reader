"use client";

import { useState } from "react";
import { ShieldOff } from "lucide-react";
import type { ViewerProps } from "@/lib/library/types";
import { readTextCapped } from "@/lib/text/read";
import {
  BarSpacer,
  LoadFailed,
  Segmented,
  ToolButton,
  useLoad,
  ViewerBar,
  ViewerFrame,
  ViewerStatus,
} from "@/components/viewer-kit";
import { CodeView } from "./code-view";

type Mode = "page" | "source";

/**
 * A web page in a sandboxed frame. Scripts are off until asked for, and even
 * then the frame has an opaque origin: it can't reach this app or its storage.
 * The app's CSP carries into the frame, so nothing remote loads either way.
 */
export default function HtmlViewer({ doc }: ViewerProps) {
  const loaded = useLoad(() => readTextCapped(doc.blob), [doc.id]);
  const [mode, setMode] = useState<Mode>("page");
  const [scripts, setScripts] = useState(false);

  if (loaded.status === "loading") {
    return (
      <ViewerFrame>
        <ViewerStatus loading title="Reading" />
      </ViewerFrame>
    );
  }
  if (loaded.status === "error") {
    return (
      <ViewerFrame>
        <LoadFailed error={loaded.error} />
      </ViewerFrame>
    );
  }

  const toggle = (
    <Segmented
      value={mode}
      onChange={setMode}
      options={[
        { value: "page", label: "Page" },
        { value: "source", label: "Source" },
      ]}
    />
  );

  if (mode === "source") return <CodeView text={loaded.value.text} language="html" leading={toggle} notice={loaded.value.notice} />;

  return (
    <ViewerFrame>
      <ViewerBar>
        {toggle}
        <BarSpacer />
        <ToolButton
          icon={ShieldOff}
          label={scripts ? "Scripts are running in an isolated frame — click to stop them" : "Run the page's scripts in an isolated frame"}
          aria-label="Run scripts"
          active={scripts}
          onClick={() => setScripts((value) => !value)}
        >
          <span className="hidden sm:inline">Run scripts</span>
        </ToolButton>
      </ViewerBar>
      <iframe
        key={String(scripts)}
        title={doc.name}
        srcDoc={loaded.value.text}
        sandbox={scripts ? "allow-scripts" : ""}
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 border-0 bg-sheet"
      />
    </ViewerFrame>
  );
}
