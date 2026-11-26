import { AskKeysSettingsService } from "@halonicjs/studio-feature-quick-ask/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import { defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { FeedbackSettingsService } from "./api.ts";
import { settingsWords } from "./settings/settings-words.ts";

/**
 * The Feedback feature: Settings → Keyboard, where the feedback shortcut and quick ask's keys
 * change, and Settings → Feedback, where feedback goes (`feedback.settings-shortcut`,
 * `feedback.settings-quick-ask`, `feedback.settings-section`). Both show only where the app gives
 * a {@link FeedbackSettingsService}: Studio's own main window.
 */
export const feedbackFeature = defineFeature({
  id: "feedback",
  title: "Feedback",
  wants: [FeedbackSettingsService, HostSettingsService, AskKeysSettingsService],
  register(studio) {
    studio.settings.add({
      id: "keyboard",
      icon: "keyboard",
      title: settingsWords.keyboardTitle,
      scope: "host",
      group: "keyboard",
      // After Agent sandbox (30) and Remote (35), before Trusted sources (40).
      order: 36,
      phone: false,
      available: feedbackSettingsAvailable,
      view: "KeyboardSection",
      load: () => import("./settings/keyboard-section.tsx"),
    });
    studio.settings.add({
      id: "feedback",
      icon: "feedback",
      title: settingsWords.feedbackTitle,
      scope: "host",
      group: "general",
      order: 37,
      phone: false,
      available: feedbackSettingsAvailable,
      view: "FeedbackSection",
      load: () => import("./settings/feedback-section.tsx"),
    });
  },
});

/** Shows the sections only where the app gives a {@link FeedbackSettingsService}. */
export function feedbackSettingsAvailable(
  context: WorkspaceContext,
  set: (available: boolean) => void,
): () => void {
  set(context.services.find(FeedbackSettingsService) !== undefined);
  return () => undefined;
}
