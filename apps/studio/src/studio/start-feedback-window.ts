import { type FeedbackWindowKind, mountFeedbackWindow } from "@halonicjs/studio-feature-feedback";
import { type DisplaySettings, watchAppearance } from "@halonicjs/studio-feature-settings";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { StartedStudio, StudioPage } from "./start-studio.ts";
import { windowLabelOf } from "./window-label.ts";

/** The labels `feedback_capture.rs` gives an overlay: one per screen, numbered from 0. */
const overlayLabel = /^feedback-overlay-\d+$/;

/**
 * The feedback window a page's window is (`studio.feedback-windows`): a screen's selection overlay
 * or the window that says capture isn't available here, or `undefined` for any other window.
 */
export function feedbackWindowOf(window: object): FeedbackWindowKind | undefined {
  const label = windowLabelOf(window);
  if (label === undefined) return undefined;
  if (overlayLabel.test(label)) return "overlay";
  if (label === "feedback-unavailable") return "unavailable";
  return undefined;
}

/**
 * Starts a feedback window: only its page, with no workspace, no engine and none of Studio's
 * frame. It follows the appearance setting, as the not-available window shows Studio's surfaces.
 */
export function startFeedbackWindow(
  page: StudioPage,
  parts: {
    readonly ipc: TauriIpc;
    readonly kind: FeedbackWindowKind;
    readonly display: DisplaySettings;
  },
): StartedStudio {
  const stopAppearance = watchAppearance(parts.display, page.element.ownerDocument.documentElement);
  const mounted = mountFeedbackWindow(page.element, parts.kind, parts.ipc);
  return {
    host: "desktop-app",
    stop: async () => {
      mounted.unmount();
      stopAppearance();
    },
  };
}
