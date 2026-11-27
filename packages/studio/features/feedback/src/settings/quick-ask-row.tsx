import type {
  AskKeys,
  AskKeysChange,
  AskKeysSettings,
} from "@halonicjs/studio-feature-quick-ask/api";
import { useEffect, useState } from "react";
import { notSavedLine, settingsWords, takenLine } from "./settings-words.ts";
import { shortcutKeys, shortcutText } from "./shortcut-keys.ts";
import { ShortcutRecorder } from "./shortcut-recorder.tsx";

/** The props of {@link QuickAskRow}. */
export interface QuickAskRowProps {
  readonly settings: AskKeysSettings;
  /** Says a refusal in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
}

/** A line under the row: what went wrong, in the attention colour when the keys are taken. */
interface Problem {
  readonly line: string;
  readonly taken: boolean;
}

/**
 * Settings → Keyboard's **Quick ask** row (`feedback.settings-quick-ask`): quick ask's keys and
 * **Change**, as the Send feedback row has. Keys another app holds say so under the row. Where the
 * desktop lets no app take a key (Wayland), the row says how to add a shortcut in the desktop's
 * own settings instead, with no Change. Until the shell has said what the keys are, no row shows.
 */
export function QuickAskRow({ settings, announce }: QuickAskRowProps) {
  const [keys, setKeys] = useAskKeys(settings);
  const [problem, setProblem] = useState<Problem>();
  if (keys === undefined) return null;
  if (keys.state === "wayland") return <WaylandRow />;

  const current = shortcutKeys(keys.shortcut, settings.platform);
  const textOf = (shortcut: string) =>
    shortcutText(shortcutKeys(shortcut, settings.platform), settings.platform);
  const shown = problem ?? takenNow(keys, textOf);

  async function record(next: string) {
    setProblem(undefined);
    const change = await changeKeys(settings, next);
    if (change === "saved") {
      setKeys({ shortcut: next, state: "on" });
      return;
    }
    if (change === "wayland") {
      setKeys({ shortcut: keys?.shortcut ?? next, state: "wayland" });
      return;
    }
    const taken = change === "taken";
    const line = taken ? takenLine(textOf(next)) : notSavedLine(settingsWords.quickAsk);
    setProblem({ line, taken });
    announce(line);
  }

  return (
    <div className="flex max-w-120 flex-col gap-1">
      <ShortcutRecorder
        name={settingsWords.quickAsk}
        keys={current}
        spoken={shortcutText(current, settings.platform)}
        onRecord={record}
      />
      {shown === undefined ? null : (
        <p className={`text-small ${shown.taken ? "text-attention" : "text-danger"}`}>
          {shown.line}
        </p>
      )}
    </div>
  );
}

/** The row where the desktop lets no app take a key: the command to give a desktop shortcut. */
function WaylandRow() {
  return (
    <div className="flex max-w-120 flex-col gap-1">
      <span className="text-body">{settingsWords.quickAsk}</span>
      <p className="text-small text-fg-muted">
        {settingsWords.waylandLine} <code>{settingsWords.askCommand}</code>
      </p>
    </div>
  );
}

/** The taken line for keys the shell couldn't register at start, before any change. */
function takenNow(keys: AskKeys, textOf: (shortcut: string) => string): Problem | undefined {
  if (keys.state !== "taken") return undefined;
  return { line: takenLine(textOf(keys.shortcut)), taken: true };
}

/**
 * Quick ask's keys once the shell has said them, and a setter for a change it saved. A read that
 * fails is said in the console, and the row stays hidden.
 */
function useAskKeys(settings: AskKeysSettings) {
  const [keys, setKeys] = useState<AskKeys>();
  useEffect(() => {
    let current = true;
    settings.keys().then(
      (read) => {
        if (current) setKeys(read);
      },
      (error: unknown) => console.error("Quick ask's keys couldn't be read:", error),
    );
    return () => {
      current = false;
    };
  }, [settings]);
  return [keys, setKeys] as const;
}

/** The shell's answer, with a host that throws read as a failed save, and said in the console. */
async function changeKeys(settings: AskKeysSettings, next: string): Promise<AskKeysChange> {
  try {
    return await settings.setKeys(next);
  } catch (error) {
    console.error("Quick ask's keys weren't changed:", error);
    return "failed";
  }
}
