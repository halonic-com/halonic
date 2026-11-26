import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import type {
  CommandContribution,
  HelpItem,
  KeyboardPlatform,
  ServiceLookup,
} from "@halonicjs/studio-shell";
import { FeedbackSettingsService } from "../api.ts";
import { feedbackPrefs } from "../feedback-prefs.ts";
import { sendFeedbackEntry } from "../settings/settings-words.ts";
import { heardShortcut, shortcutKeys, shortcutText } from "../settings/shortcut-keys.ts";

/** The Ctrl K entry's id, under the `feedback.shortcuts` source. */
export const sendFeedbackCommand = "feedback.shortcuts.send-feedback";

/**
 * Help › Send feedback (`feedback.help-send-feedback`): "Send feedback (Ctrl+Shift+F)", naming the
 * shortcut the window hears now, and beginning a feedback as the shortcut does. None where the
 * window doesn't take feedback, and none while Studio isn't connected to Paperclip, by the same
 * check that lets the shortcut through then (`feedback.connected-only`).
 */
export function sendFeedbackHelpItems(services: ServiceLookup): readonly HelpItem[] {
  const host = startingHost(services);
  if (host === undefined) return [];
  return [{ id: "send-feedback", label: titleOf(services, host), run: () => host.start() }];
}

/** The same entry in Ctrl K. Desktop only: a phone takes no feedback. */
export function sendFeedbackCommands(services: ServiceLookup): readonly CommandContribution[] {
  const host = startingHost(services);
  if (host === undefined) return [];
  return [
    {
      id: sendFeedbackCommand,
      title: titleOf(services, host),
      phone: false,
      run: async () => host.start(),
    },
  ];
}

/**
 * Calls `listener` when the entry may have changed: Studio connected or lost its connection, or
 * Settings saved another shortcut. Gives the stop.
 */
export function subscribeSendFeedback(services: ServiceLookup, listener: () => void): () => void {
  const stopConnected = services.find(FeedbackSettingsService)?.connected?.subscribe(listener);
  const stopSettings = services.find(HostSettingsService)?.onChange((keys) => {
    if (keys.includes(feedbackPrefs.shortcut.key)) listener();
  });
  return () => {
    stopConnected?.();
    stopSettings?.();
  };
}

/** The window's platform and its start while it can begin a feedback now. */
function startingHost(services: ServiceLookup): StartingHost | undefined {
  const host = services.find(FeedbackSettingsService);
  if (host?.start === undefined || host.connected?.current() === false) return undefined;
  return { platform: host.platform, start: () => host.start?.() };
}

interface StartingHost {
  readonly platform: KeyboardPlatform;
  readonly start: () => void;
}

/** "Send feedback (Ctrl+Shift+F)", and "Send feedback (⌘⇧F)" on macOS. */
function titleOf(services: ServiceLookup, host: StartingHost): string {
  const settings = services.find(HostSettingsService);
  const saved =
    settings?.loaded === true
      ? settings.get(feedbackPrefs.shortcut)
      : feedbackPrefs.shortcut.fallback;
  const { platform } = host;
  return sendFeedbackEntry(shortcutText(shortcutKeys(heardShortcut(saved), platform), platform));
}
