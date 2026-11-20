import { AlertIcon, Button, OnTintContext, WarningIcon } from "@halonicjs/studio-kit";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type AnnouncerTimers, systemTimers } from "../announcer/timers.ts";
import { type SaveNoteMark, saveNoteActionLabels, saveNoteWords } from "../save/save-note-words.ts";
import type { SaveNote, SaveState } from "../save/save-state.ts";

/** How long a write runs before the note says "Saving…", as for loading (microcopy 1.1). */
export const SAVING_AFTER_MS = 300;

/** Props for {@link StatusBarSaveNote}. */
export interface StatusBarSaveNoteProps {
  /** The open workspace's save state. */
  readonly saving: SaveState;
  /** Timers for the "Saving…" wait; tests pass fake ones. */
  readonly timers?: AnnouncerTimers;
}

/**
 * The save note (save model 1.4), for the status bar's right end (`ShellFrame`'s `saveNote` slot):
 * "✓ Saved", "Saving…", "2 fields not saved", "1 item not saved · Compare" or "Couldn't save
 * *Support reply* · Try again". It's the only place saving shows. A write shorter than 300ms
 * never shows "Saving…", so the status bar doesn't blink while the user types.
 *
 * The note isn't a live region; `announceSaveNotes` reads out the states worth hearing, once.
 * While it's a problem it carries `data-problem="warning"` or `"danger"`, the tone of its mark, so
 * the bar round it can take that tone's soft fill without knowing the save state.
 *
 * @example
 * <ShellFrame saveNote={<StatusBarSaveNote saving={workspace.saving} />} …>
 */
export function StatusBarSaveNote({ saving, timers = systemTimers }: StatusBarSaveNoteProps) {
  const note = useShownNote(saving, timers);
  const words = saveNoteWords(note);
  const action = words.action;
  // "Compare" alone doesn't say which item, so its name does: "Compare Support triage"
  // (microcopy 19.2).
  const heldName =
    action === "compare" && note.kind === "items-not-saved" ? note.first.title : undefined;
  return (
    <div
      className="flex items-center gap-1.5 whitespace-nowrap text-small text-fg-muted phone:min-w-0 phone:flex-1"
      data-problem={isProblem(words.mark) ? words.mark : undefined}
    >
      {marks[words.mark]}
      {words.name === undefined ? (
        <span className={isProblem(words.mark) ? `${longWords} text-fg` : undefined}>
          {words.text}
        </span>
      ) : (
        <>
          <span aria-hidden="true">{words.text}</span>
          <span className="sr-only">{words.name}</span>
        </>
      )}
      {action === undefined ? null : (
        <>
          <span aria-hidden="true">·</span>
          {/* An action shows only on a problem, so the bar round it has a soft fill: the action
              reads in `accent-text` there, like the badges' "Review" and the toast's Try again. */}
          <OnTintContext value={true}>
            <span className="flex shrink-0 phone:ms-auto">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => (action === "try-again" ? saving.tryAgain() : saving.compare())}
              >
                {saveNoteActionLabels[action]}
                {heldName === undefined ? null : <span className="sr-only"> {heldName}</span>}
              </Button>
            </span>
          </OnTintContext>
        </>
      )}
    </div>
  );
}

/**
 * The mark before the words. Warning and danger are named, so they don't rest on colour alone
 * (UX section 0); the tick is decoration, as the note's name already says "saved".
 */
const marks: Readonly<Record<SaveNoteMark, ReactNode>> = {
  none: null,
  check: <span aria-hidden="true">✓</span>,
  warning: <NamedMark name="Warning" colour="text-warning" icon={<WarningIcon />} />,
  danger: <NamedMark name="Error" colour="text-danger" icon={<AlertIcon />} />,
};

/**
 * A problem's words stop at 240px (on a phone, at the width the action leaves) and end in "…", so
 * a long item title can't push the other status items away or hide the button, which keeps its
 * width. The whole title stays in the text, so a screen reader reads all of it, and the
 * failed-save toast shows it in full. On a phone the words don't grow: the "·" stays right after
 * them, and the room left over falls before the action, at the strip's right end.
 */
const longWords = "min-w-0 max-w-60 truncate phone:max-w-none";

/** A problem's words read in the text colour; "Saving…" and "Saved" stay quiet in `fg-muted`. */
function isProblem(mark: SaveNoteMark): boolean {
  return mark === "warning" || mark === "danger";
}

interface NamedMarkProps {
  readonly name: string;
  readonly colour: string;
  readonly icon: ReactNode;
}

function NamedMark({ name, colour, icon }: NamedMarkProps) {
  return (
    <span role="img" aria-label={name} className={`size-icon-sm shrink-0 *:size-full ${colour}`}>
      {icon}
    </span>
  );
}

/**
 * The note to show: the save state's note, except that "Saving…" waits {@link SAVING_AFTER_MS}.
 * Until then the note shown before stays, so a quick save goes straight from "✓ Saved" to
 * "✓ Saved".
 */
function useShownNote(saving: SaveState, timers: AnnouncerTimers): SaveNote {
  const subscribe = useCallback((listener: () => void) => saving.subscribe(listener), [saving]);
  const note = useSyncExternalStore(subscribe, () => saving.note);
  const shownBefore = useRef<SaveNote>({ kind: "saved" });
  const [savingShown, setSavingShown] = useState<SaveNote | undefined>(undefined);

  useEffect(() => {
    if (note.kind !== "saving") {
      shownBefore.current = note;
      return;
    }
    const handle = timers.setTimeout(() => setSavingShown(note), SAVING_AFTER_MS);
    return () => timers.clearTimeout(handle);
  }, [note, timers]);

  if (note.kind !== "saving" || savingShown === note) {
    return note;
  }
  return shownBefore.current;
}
