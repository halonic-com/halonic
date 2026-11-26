import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { FeedbackIpc } from "./feedback-ipc.ts";
import { FeedbackOverlay } from "./overlay/feedback-overlay.tsx";
import { CaptureUnavailable } from "./unavailable/capture-unavailable.tsx";

/** A feedback window's page, drawn into its element until it is unmounted. */
export interface MountedFeedbackWindow {
  unmount(): void;
}

/** The feedback windows the shell opens on Studio's page, by what they show. */
export type FeedbackWindowKind = "overlay" | "unavailable";

/**
 * Draws a feedback window's page into `element`: a screen's selection overlay or the window that
 * says capture isn't available here. Neither opens a workspace.
 *
 * @example
 * mountFeedbackWindow(root, "overlay", ipc);
 */
export function mountFeedbackWindow(
  element: Element,
  kind: FeedbackWindowKind,
  ipc: FeedbackIpc,
): MountedFeedbackWindow {
  const root = createRoot(element);
  root.render(
    <StrictMode>
      {kind === "overlay" ? <FeedbackOverlay ipc={ipc} /> : <CaptureUnavailable ipc={ipc} />}
    </StrictMode>,
  );
  return { unmount: () => root.unmount() };
}
