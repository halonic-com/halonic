import { Button, Kbd } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { settingsWords } from "./settings-words.ts";
import { recordedShortcut } from "./shortcut-keys.ts";

/** The props of {@link ShortcutRecorder}. */
export interface ShortcutRecorderProps {
  /** The row's name: "Send feedback". */
  readonly name: string;
  /** The keys it has now, one box each: `["Ctrl", "Alt", "F"]`. */
  readonly keys: readonly string[];
  /** The same keys in words, for screen readers: "Ctrl+Alt+F". */
  readonly spoken: string;
  /**
   * Called with a recorded shortcut in the shell's words (`"Control+Alt+KeyK"`). The row shows
   * Change as busy until it settles; it must not reject.
   */
  readonly onRecord: (shortcut: string) => Promise<void>;
}

/**
 * A shortcut row: its name, its keys and **Change**. Change starts recording: the row reads
 * "Press the new shortcut", and the next press with Ctrl, Alt or ⌘ is handed to `onRecord`. Esc,
 * Change again or leaving the row stops without a change. While it records it takes every key
 * press first, so Esc doesn't also close Settings and a press does nothing else in Studio. A
 * press without Ctrl, Alt or ⌘ is not a shortcut the shell takes, so it keeps recording.
 *
 * @example
 * <ShortcutRecorder name="Send feedback" keys={["Ctrl", "Alt", "F"]} spoken="Ctrl+Alt+F" onRecord={save} />
 */
export function ShortcutRecorder({ name, keys, spoken, onRecord }: ShortcutRecorderProps) {
  const row = useRef<HTMLDivElement>(null);
  const nameId = useId();
  const { recording, saving, setRecording } = useRecording(row, onRecord);

  return (
    <div ref={row} className="flex items-center justify-between gap-3">
      <span id={nameId} className="text-body">
        {name}
      </span>
      <div className="flex items-center gap-2">
        <span aria-live="polite" className="flex items-center gap-1 text-small text-fg-muted">
          {recording ? (
            <>
              {/* Kbd is hidden from screen readers, so Esc is also said in words. */}
              {settingsWords.recording} <span aria-hidden="true">·</span> <Kbd keys={["Esc"]} />
              <span className="sr-only">Esc</span> {settingsWords.escToStop}
            </>
          ) : (
            <>
              <Kbd keys={keys} />
              <span className="sr-only">{spoken}</span>
            </>
          )}
        </span>
        <Button
          variant="secondary"
          size="sm"
          busy={saving}
          aria-describedby={nameId}
          onClick={() => setRecording((was) => !was)}
        >
          {settingsWords.change}
        </Button>
      </div>
    </div>
  );
}

/**
 * Records one shortcut into `onRecord` while `recording`: it takes every key press on the window
 * before anything else, and stops on Esc, on a shortcut or when focus leaves `row`.
 */
function useRecording(
  row: RefObject<HTMLDivElement | null>,
  onRecord: (shortcut: string) => Promise<void>,
) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const element = row.current;
    const target = element?.ownerDocument.defaultView;
    if (!recording || element === null || target == null) return;
    const listener = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape" && !(event.ctrlKey || event.altKey || event.metaKey)) {
        setRecording(false);
        return;
      }
      const shortcut = recordedShortcut(event);
      if (shortcut === undefined) return;
      setRecording(false);
      setSaving(true);
      void onRecord(shortcut).finally(() => setSaving(false));
    };
    // Capture on the window runs before Settings' own Esc and every other key handler.
    target.addEventListener("keydown", listener, true);
    // Leaving the row stops recording, so a press elsewhere in Studio isn't taken.
    const leave = (event: FocusEvent) => {
      if (!element.contains(event.relatedTarget as Node | null)) setRecording(false);
    };
    element.addEventListener("focusout", leave);
    return () => {
      target.removeEventListener("keydown", listener, true);
      element.removeEventListener("focusout", leave);
    };
  }, [recording, onRecord]);
  return { recording, saving, setRecording };
}
