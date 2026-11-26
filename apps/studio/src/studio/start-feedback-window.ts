import { type FeedbackWindowKind, mountFeedbackWindow } from "@halonicjs/studio-feature-feedback";
import { type DisplaySettings, watchAppearance } from "@halonicjs/studio-feature-settings";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { StartedStudio, StudioPage } from "./start-studio.ts";
import { windowLabelOf } from "./window-label.ts";

/**
 * The feedback window a page's window is (`studio.feedback-windows`): the window that says capture
 * isn't available here, or `undefined` for any other window. The selection overlay has no window
 * of its own: it shows inside the Studio window where the shortcut was pressed.
 */
export function feedbackWindowOf(window: object): FeedbackWindowKind | undefined {
  const label = windowLabelOf(window);
  if (label === undefined) return undefined;
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
  const mounted = mountFeedbackWindow(page.element, { kind: parts.kind }, parts.ipc);
  return {
    host: "desktop-app",
    stop: async () => {
      mounted.unmount();
      stopAppearance();
    },
  };
}
