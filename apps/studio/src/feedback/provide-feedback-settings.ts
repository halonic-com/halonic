import type { ServiceRegistry } from "@halonicjs/app";
import {
  type FeedbackSettingsHost,
  FeedbackSettingsService,
  type ShortcutChange,
} from "@halonicjs/studio-feature-feedback/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";

/**
 * Gives Settings → Keyboard and Settings → Feedback the shell's feedback shortcut
 * (`studio.feedback-settings`), in Studio's own main window only: the shell grants
 * `plugin:feedback|shortcut_set` to no other window, and served Studio has no shell.
 */
export function provideFeedbackSettings(
  services: ServiceRegistry,
  ipc: TauriIpc | undefined,
  windowLabel: string | undefined,
  platform: KeyboardPlatform,
): void {
  if (ipc === undefined || windowLabel !== "main") return;
  services.provide(FeedbackSettingsService, feedbackSettingsOf(ipc, platform));
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
