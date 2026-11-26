import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { FeedbackIpc } from "./feedback-ipc.ts";
import { type FeedbackDetails, SendFeedback, type SendOutgoing } from "./send/send-feedback.tsx";
import { CaptureUnavailable } from "./unavailable/capture-unavailable.tsx";

/** A feedback window's page, drawn into its element until it is unmounted. */
export interface MountedFeedbackWindow {
  unmount(): void;
}

/**
 * The feedback windows that need nothing but the shell, by what they show. The selection overlay
 * isn't one: it shows inside Studio's own window (`startInAppFeedback`).
 */
export type FeedbackWindowKind = "unavailable";

/** A feedback window to draw, with what the Send feedback window needs to send. */
export type FeedbackWindow =
  | { readonly kind: FeedbackWindowKind }
  | { readonly kind: "send"; readonly send: SendOutgoing; readonly details: FeedbackDetails };

/**
 * Draws a feedback window's page into `element`: the Send feedback window, or the window that
 * says capture isn't available here. Neither opens a workspace.
 *
 * @example
 * mountFeedbackWindow(root, { kind: "unavailable" }, ipc);
 */
export function mountFeedbackWindow(
  element: Element,
  window: FeedbackWindow,
  ipc: FeedbackIpc,
): MountedFeedbackWindow {
  const root = createRoot(element);
  root.render(<StrictMode>{pageOf(window, ipc)}</StrictMode>);
  return { unmount: () => root.unmount() };
}

function pageOf(window: FeedbackWindow, ipc: FeedbackIpc) {
  if (window.kind === "send") {
    return <SendFeedback ipc={ipc} send={window.send} details={window.details} />;
  }
  return <CaptureUnavailable ipc={ipc} />;
}
