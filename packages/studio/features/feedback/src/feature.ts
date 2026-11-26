import { AskKeysSettingsService, AskOpenerService } from "@halonicjs/studio-feature-quick-ask/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import { defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { AskKeysTextService, FeedbackSettingsService } from "./api.ts";
import { AskKeysWatch } from "./help/ask-keys-watch.ts";
import { quickAskCommands, quickAskHelpItems } from "./help/quick-ask-entry.ts";
import { settingsWords } from "./settings/settings-words.ts";

/**
 * The Feedback feature: Settings → Keyboard, where the feedback shortcut and quick ask's keys
 * change, and Settings → Feedback, where feedback goes (`feedback.settings-shortcut`,
 * `feedback.settings-quick-ask`, `feedback.settings-section`). Both show only where the app gives
 * a {@link FeedbackSettingsService}: Studio's own main window. Help › Quick ask and its Ctrl K
 * entry show the box, with its keys, where the app gives an opener (`feedback.help-quick-ask`).
 */
export const feedbackFeature = defineFeature({
  id: "feedback",
  title: "Feedback",
  wants: [FeedbackSettingsService, HostSettingsService, AskKeysSettingsService, AskOpenerService],
  provides: [AskKeysTextService],
  register(studio) {
    studio.services.provide(
      AskKeysTextService,
      (services) => new AskKeysWatch(services.find(AskKeysSettingsService)),
    );
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
      available: feedbackSectionAvailable,
      view: "FeedbackSection",
      load: () => import("./settings/feedback-section.tsx"),
    });
    // After Check this computer (10), before First run (20).
    studio.help.add({
      id: "feedback.help",
      order: 15,
      items: (context) => quickAskHelpItems(context.services),
      subscribe: (context, listener) =>
        context.services.get(AskKeysTextService).subscribe(listener),
    });
    studio.commands.addSource({
      id: "feedback.shortcuts",
      commands: (context) => (context === undefined ? [] : quickAskCommands(context.services)),
    });
  },
});

/**
 * Shows Settings → Feedback only where the app gives a {@link FeedbackSettingsService}, and only
 * while Studio is connected to Paperclip (`feedback.connected-only`).
 */
export function feedbackSectionAvailable(
  context: WorkspaceContext,
  set: (available: boolean) => void,
): () => void {
  const connected = context.services.find(FeedbackSettingsService)?.connected;
  if (connected === undefined) return feedbackSettingsAvailable(context, set);
  set(connected.current());
  return connected.subscribe(() => set(connected.current()));
}

/** Shows the sections only where the app gives a {@link FeedbackSettingsService}. */
export function feedbackSettingsAvailable(
  context: WorkspaceContext,
  set: (available: boolean) => void,
): () => void {
  set(context.services.find(FeedbackSettingsService) !== undefined);
  return () => undefined;
}
