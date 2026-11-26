import type { HostSetting, HostSettings } from "@halonicjs/app";
import {
  type AskKeysSettings,
  AskKeysSettingsService,
} from "@halonicjs/studio-feature-quick-ask/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  type FeedbackConnected,
  type FeedbackSettingsHost,
  FeedbackSettingsService,
  type ShortcutChange,
} from "../api.ts";
import { feedbackPrefs } from "../feedback-prefs.ts";
import { QuickAskRow } from "./quick-ask-row.tsx";
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
      askKeys={context.services.find(AskKeysSettingsService)}
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
  /** Quick ask's keys, where the app gives them; without them there's no Quick ask row. */
  readonly askKeys?: AskKeysSettings | undefined;
}

/**
 * Settings → Keyboard (`feedback.settings-shortcut`): the **Send feedback** row. A recorded
 * shortcut goes to the shell; the row shows the new keys once the shell saved them, and keeps
 * the old ones, with the reason under the row, when it didn't. Below it, the **Quick ask** row
 * where the app gives quick ask's keys. The Send feedback row shows only while Studio is connected to
 * Paperclip (`feedback.connected-only`), so no row offers keys that do nothing.
 */
export function KeyboardView({ host, saved, announce, askKeys }: KeyboardViewProps) {
  const [shortcut, setShortcut] = useState(saved);
  const [problem, setProblem] = useState<{ line: string; taken: boolean }>();
  const keys = shortcutKeys(shortcut, host.platform);
  const connected = useConnected(host.connected);

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
    <div className="flex flex-col gap-4">
      {connected ? (
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
      ) : null}
      {askKeys === undefined ? null : <QuickAskRow settings={askKeys} announce={announce} />}
    </div>
  );
}

const alwaysConnected: FeedbackConnected = {
  current: () => true,
  subscribe: () => () => undefined,
};

/** Whether Studio is connected to Paperclip, kept current; absent counts as connected. */
function useConnected(connected: FeedbackConnected = alwaysConnected): boolean {
  // A new function each render would make React subscribe again on every render.
  const subscribe = useCallback(
    (listener: () => void) => connected.subscribe(listener),
    [connected],
  );
  return useSyncExternalStore(subscribe, () => connected.current());
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
