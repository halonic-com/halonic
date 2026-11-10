import type { Announcer } from "../announcer/announcer.ts";
import type { SaveNote, SaveState } from "./save-state.ts";

/** The mark before the note's words. A warning or danger mark is named, not shown in colour alone. */
export type SaveNoteMark = "none" | "check" | "warning" | "danger";

/** The button after the note's words, which runs `SaveState.tryAgain` or `SaveState.compare`. */
export type SaveNoteAction = "try-again" | "compare";

/** What the toolbar's save note shows for a {@link SaveNote}. */
export interface SaveNoteWords {
  /** The words on screen: "Couldn't save Support reply", "2 fields not saved", "Saved". */
  readonly text: string;
  /** What a screen reader reads instead, when it differs: "All changes saved". */
  readonly name?: string;
  readonly mark: SaveNoteMark;
  readonly action?: SaveNoteAction;
}

/** The button labels, as on the failed-save toast (microcopy 2). */
export const saveNoteActionLabels: Readonly<Record<SaveNoteAction, string>> = {
  "try-again": "Try again",
  compare: "Compare",
};

/**
 * Words the toolbar's save note shows (save model 1.4, microcopy 2). A failure names the item when
 * one failed, as the toast does: "Couldn't save *Support reply* · Try again", and counts them when
 * several did: "Couldn't save 2 items · Try again". "Saving…" uses the ellipsis character.
 *
 * @example
 * saveNoteWords({ kind: "fields-not-saved", count: 2 });
 * // { text: "2 fields not saved", mark: "warning" }
 */
export function saveNoteWords(note: SaveNote): SaveNoteWords {
  switch (note.kind) {
    case "failed":
      return {
        text: `Couldn't save ${note.count === 1 ? note.first.title : `${note.count} items`}`,
        mark: "danger",
        action: "try-again",
      };
    case "items-not-saved":
      return { text: countOf(note.count, "item", "not saved"), mark: "warning", action: "compare" };
    case "fields-not-saved":
      return { text: countOf(note.count, "field", "not saved"), mark: "warning" };
    case "saving":
      return { text: "Saving…", mark: "none" };
    case "saved":
      return { text: "Saved", name: "All changes saved", mark: "check" };
  }
}

/** "1 item not saved", "2 items not saved". */
function countOf(count: number, noun: string, rest: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`} ${rest}`;
}

/**
 * Reads the save note out politely, once each time it becomes items not saved (UX HAL-3838).
 * Failed isn't read: its danger toast is an alert that already reads the failure, with its reason,
 * so the note would say it twice. Saving and saved are never read: a screen reader hearing "Saved"
 * after every pause in typing is noise. A note that stays items not saved while its count changes
 * isn't read again. Returns a function that stops it.
 *
 * @example
 * const stop = announceSaveNotes(workspace.saving, shell.announcer);
 */
export function announceSaveNotes(saving: SaveState, announcer: Announcer): () => void {
  let kind = saving.note.kind;
  return saving.subscribe(() => {
    const note = saving.note;
    if (note.kind !== kind && isSpoken(note)) {
      announcer.announce(`${saveNoteWords(note).text}.`);
    }
    kind = note.kind;
  });
}

/** Only items not saved: it has no toast, so the note is the only thing that can say it. */
function isSpoken(note: SaveNote): boolean {
  return note.kind === "items-not-saved";
}
