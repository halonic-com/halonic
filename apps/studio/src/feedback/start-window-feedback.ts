import { type HostSettings, ServiceRegistry } from "@halonicjs/app";
import {
  type FeedbackDetails,
  type InAppFeedbackParts,
  type SendOutgoing,
  startInAppFeedback,
} from "@halonicjs/studio-feature-feedback";
import { feedbackPrefs } from "@halonicjs/studio-feature-feedback/api";
import { provideShellHostSettings, type TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { halonicVersion } from "../studio/open-trusts.ts";
import { hostSettingsOf } from "../studio/window-host-settings.ts";

/**
 * Starts the feedback shortcut in one of Studio's own windows: Studio, Halonic Inbox or Halonic
 * Messenger (`feedback.in-app`). The window hears the shortcut only while it is focused,
 * and the selection overlay and then the Send feedback dialog show inside it. The shortcut, the
 * project and the assignee are read from the window's host settings when they're needed, so a
 * change in Settings counts at once. "Feedback discarded" shows in the window's `toasts`. Gives
 * the stop.
 */
export function startWindowFeedback(
  page: { readonly window: object },
  ipc: TauriIpc,
  platform: KeyboardPlatform,
  toasts: InAppFeedbackParts["toasts"],
): () => void {
  const window = page.window as Window;
  if (typeof window.addEventListener !== "function" || window.document === undefined) {
    return () => undefined;
  }
  const services = new ServiceRegistry();
  provideShellHostSettings(services, page.window);
  let settings: HostSettings | undefined;
  void hostSettingsOf(services, page.window).then((loaded) => {
    settings = loaded;
  });
  const read = (setting: (typeof feedbackPrefs)[keyof typeof feedbackPrefs]) =>
    settings?.loaded === true ? settings.get(setting) : setting.fallback;
  return startInAppFeedback({
    ipc,
    platform,
    window,
    shortcut: () => read(feedbackPrefs.shortcut),
    details: (): FeedbackDetails => ({
      project: read(feedbackPrefs.project),
      assignee: read(feedbackPrefs.assignee),
      studioVersion: halonicVersion,
      mac: platform === "macos",
      now: () => new Date(),
    }),
    send: notSentYet,
    toasts,
  });
}

/**
 * Sending goes through the outbox and the agent host in the next pull request of HAL-19528. Until
 * then Send says in the console why nothing was sent, and the dialog keeps the text.
 */
const notSentYet: SendOutgoing = async () => {
  throw new Error("Sending feedback isn't wired in this build yet.");
};
