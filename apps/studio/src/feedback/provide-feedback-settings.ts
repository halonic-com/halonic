import type { ServiceRegistry } from "@halonicjs/app";
import {
  type FeedbackConnected,
  type FeedbackSettingsHost,
  FeedbackSettingsService,
  type ShortcutChange,
} from "@halonicjs/studio-feature-feedback/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";

/** What Settings › Feedback shows of the main window's feedback: what waits, and the connection. */
export interface FeedbackSettingsFeed extends FeedbackConnected {
  waiting(): Promise<number>;
  /** Begins a feedback as the window's shortcut does, for Help and Ctrl K. */
  begin(): void;
}

/**
 * Gives Settings → Keyboard and Settings → Feedback the shell's feedback shortcut
 * (`studio.feedback-settings`), in Studio's own main window only: the shell grants
 * `plugin:feedback|shortcut_set` to no other window, and served Studio has no shell. With the main
 * window's `feedback`, Settings › Feedback counts what waits to be sent and, with the shortcut's
 * row, shows only while Studio is connected to Paperclip, and Help and Ctrl K begin a feedback.
 */
export function provideFeedbackSettings(
  services: ServiceRegistry,
  ipc: TauriIpc | undefined,
  windowLabel: string | undefined,
  platform: KeyboardPlatform,
  feedback?: FeedbackSettingsFeed,
): void {
  if (ipc === undefined || windowLabel !== "main") return;
  const host = feedbackSettingsOf(ipc, platform);
  if (feedback === undefined) {
    services.provide(FeedbackSettingsService, host);
    return;
  }
  services.provide(FeedbackSettingsService, {
    ...host,
    waiting: () => feedback.waiting(),
    connected: feedback,
    start: () => feedback.begin(),
  });
}

/** The shell's refusals of `shortcut_set` (`feedback_shortcut.rs`). */
const refusals: readonly ShortcutChange[] = ["taken", "invalid", "unavailable", "failed"];

/**
 * The shell's `plugin:feedback|shortcut_set` (HAL-18778). A refusal it names is the answer;
 * anything else it throws is thrown on, for Settings to say it couldn't save.
 */
export function feedbackSettingsOf(
  ipc: TauriIpc,
  platform: KeyboardPlatform,
): FeedbackSettingsHost {
  return {
    platform,
    setShortcut: async (shortcut) => {
      try {
        await ipc.invoke("plugin:feedback|shortcut_set", { shortcut });
        return "saved";
      } catch (refusal) {
        const named = refusals.find((each) => each === refusal);
        if (named !== undefined) return named;
        throw new Error(`plugin:feedback|shortcut_set refused: ${String(refusal)}`);
      }
    },
  };
}
