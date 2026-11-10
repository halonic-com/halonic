import { AlertIcon, Button, WarningIcon } from "@halonicjs/studio-kit";
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

/** Props for {@link ToolbarSaveNote}. */
export interface ToolbarSaveNoteProps {
  /** The open workspace's save state. */
  readonly saving: SaveState;
  /** Timers for the "Saving…" wait; tests pass fake ones. */
  readonly timers?: AnnouncerTimers;
}

/**
 * The toolbar's save note (save model 1.4), for the toolbar's `saveState` slot: "✓ Saved",
 * "Saving…", "2 fields not saved", "1 item not saved · Compare" or "Couldn't save *Support reply*
 * · Try again". It's the only place saving shows. A write shorter than 300ms never shows
 * "Saving…", so the toolbar doesn't blink while the user types.
 *
 * The note isn't a live region; `announceSaveNotes` reads out the states worth hearing, once.
 *
 * @example
 * <Toolbar
 *   tabs={workspace.tabs}
 *   announcer={shell.announcer}
 *   saveState={<ToolbarSaveNote saving={workspace.saving} />}
 * />
 */
export function ToolbarSaveNote({ saving, timers = systemTimers }: ToolbarSaveNoteProps) {
  const note = useShownNote(saving, timers);
  const words = saveNoteWords(note);
  const action = words.action;
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-small text-fg-muted">
      {marks[words.mark]}
      {words.name === undefined ? (
        <span className={isProblem(words.mark) ? "text-fg" : undefined}>{words.text}</span>
      ) : (
        <>
          <span aria-hidden="true">{words.text}</span>
          <span className="sr-only">{words.name}</span>
        </>
      )}
      {action === undefined ? null : (
        <>
          <span aria-hidden="true">·</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (action === "try-again" ? saving.tryAgain() : saving.compare())}
          >
            {saveNoteActionLabels[action]}
          </Button>
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
