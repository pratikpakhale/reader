"use client";

import type { ViewerProps } from "@/lib/library/types";
import { readTextCapped, languageOf } from "@/lib/text/read";
import { LoadFailed, useLoad, ViewerFrame, ViewerStatus } from "@/components/viewer-kit";
import { CodeView } from "./code-view";

/** Source code, and the plain-text reading of anything textual. */
export default function CodeViewer({ doc }: ViewerProps) {
  const loaded = useLoad(() => readTextCapped(doc.blob), [doc.id]);
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
  return <CodeView text={loaded.value.text} language={languageOf(doc)} notice={loaded.value.notice} />;
}
