import type { HostSetting, HostSettings } from "@halonicjs/app";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useState } from "react";
import { type FeedbackSettingsHost, FeedbackSettingsService, type ShortcutChange } from "../api.ts";
import { feedbackPrefs } from "../feedback-prefs.ts";
import { notSavedLine, settingsWords, takenLine } from "./settings-words.ts";
import { shortcutKeys, shortcutText } from "./shortcut-keys.ts";
import { ShortcutRecorder } from "./shortcut-recorder.tsx";

/** Settings → Keyboard as the settings container shows it, in Studio's own main window. */
export function KeyboardSection({ context }: SettingsSectionProps) {
  const host = context.services.find(FeedbackSettingsService);
  if (host === undefined) return null;
  const settings = context.services.find(HostSettingsService);
  return (
    <KeyboardView
      host={host}
      saved={savedValue(settings, feedbackPrefs.shortcut)}
      announce={(line) => context.announcer.announce(line)}
    />
  );
}

/** The props of {@link KeyboardView}. */
export interface KeyboardViewProps {
  readonly host: FeedbackSettingsHost;
  /** The shortcut the shell saved, in its words: `"control+alt+KeyF"`. */
  readonly saved: string;
  /** Says a refusal in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
}

/**
 * Settings → Keyboard (`feedback.settings-shortcut`): the **Send feedback** row. A recorded
 * shortcut goes to the shell; the row shows the new keys once the shell saved them, and keeps
 * the old ones, with the reason under the row, when it didn't.
 */
export function KeyboardView({ host, saved, announce }: KeyboardViewProps) {
  const [shortcut, setShortcut] = useState(saved);
  const [problem, setProblem] = useState<{ line: string; taken: boolean }>();
  const keys = shortcutKeys(shortcut, host.platform);

  async function record(next: string) {
    setProblem(undefined);
    const change = await changeShortcut(host, next);
    if (change === "saved") {
      setShortcut(next);
      return;
    }
    const taken = change === "taken";
    const line = taken
      ? takenLine(shortcutText(shortcutKeys(next, host.platform), host.platform))
      : notSavedLine(settingsWords.sendFeedback);
    setProblem({ line, taken });
    announce(line);
  }

  return (
    <div className="flex max-w-120 flex-col gap-1">
      <ShortcutRecorder
        name={settingsWords.sendFeedback}
        keys={keys}
        spoken={shortcutText(keys, host.platform)}
        onRecord={record}
      />
      {problem === undefined ? null : (
        <p className={`text-small ${problem.taken ? "text-attention" : "text-danger"}`}>
          {problem.line}
        </p>
      )}
    </div>
  );
}

/** The shell's answer, with a host that throws read as a failed save, and said in the console. */
async function changeShortcut(host: FeedbackSettingsHost, next: string): Promise<ShortcutChange> {
  try {
    return await host.setShortcut(next);
  } catch (error) {
    console.error("The feedback shortcut wasn't changed:", error);
    return "failed";
  }
}

/** A host setting's value, or its fallback where the settings are missing or couldn't be read. */
export function savedValue(
  settings: HostSettings | undefined,
  setting: HostSetting<string>,
): string {
  return settings?.loaded === true ? settings.get(setting) : setting.fallback;
}
