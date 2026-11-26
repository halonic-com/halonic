import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { FeedbackIpc } from "./feedback-ipc.ts";
import { CaptureUnavailable } from "./unavailable/capture-unavailable.tsx";

/** A feedback window's page, drawn into its element until it is unmounted. */
export interface MountedFeedbackWindow {
  unmount(): void;
}

/**
 * The feedback windows, by what they show. The selection overlay and the Send feedback dialog
 * aren't windows: they show inside Studio's own window (`startInAppFeedback`).
 */
export type FeedbackWindowKind = "unavailable";

/** A feedback window to draw. */
export interface FeedbackWindow {
  readonly kind: FeedbackWindowKind;
}

/**
 * Draws a feedback window's page into `element`: the window that says capture isn't available
 * here. It opens no workspace.
 *
 * @example
 * mountFeedbackWindow(root, { kind: "unavailable" }, ipc);
 */
export function mountFeedbackWindow(
  element: Element,
  _window: FeedbackWindow,
  ipc: FeedbackIpc,
): MountedFeedbackWindow {
  const root = createRoot(element);
  root.render(
    <StrictMode>
      <CaptureUnavailable ipc={ipc} />
    </StrictMode>,
  );
  return { unmount: () => root.unmount() };
}
