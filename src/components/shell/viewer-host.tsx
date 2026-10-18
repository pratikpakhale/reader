"use client";

import { Component, type ReactNode } from "react";
import type { Doc } from "@/lib/library/types";
import { LoadFailed } from "@/components/viewer-kit";
import { VIEWERS, viewerFor } from "@/components/viewers/registry";

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div className="absolute inset-0 flex flex-col">
        <LoadFailed error={this.state.error} />
      </div>
    ) : (
      this.props.children
    );
  }
}

/**
 * Keyed on the doc and the chosen viewer, so switching either starts the
 * viewer fresh and a crash in one never sticks to the next.
 */
export function ViewerHost({ doc }: { doc: Doc }) {
  const viewer = viewerFor(doc);
  const Viewer = VIEWERS[viewer];
  return (
    <Boundary key={`${doc.id}:${viewer}`}>
      <Viewer doc={doc} />
    </Boundary>
  );
}
