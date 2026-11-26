import { TRY_AGAIN } from "./about-text.ts";
import * as text from "./update-dialog-text.ts";
import type { UpdaterHost } from "./updater-host.ts";
import type { UpdateState, UpdateStatus, VersionNotes } from "./updater-status.ts";

/** The states in which the title bar shows **Update**: a newer version is found, coming or ready. */
const SHOWN = [
  "available",
  "downloading",
  "download-failed",
  "signature-mismatch",
  "ready",
] as const;

/** A state the Update button and its dialog are for. */
export type OfferedState = Extract<UpdateState, { kind: (typeof SHOWN)[number] }>;

/**
 * The offered update, or `null` when the title bar shows no **Update** (`settings.update-button`):
 * never while nothing newer is known, and never when another tool, such as Scoop, manages updates.
 */
export function offeredUpdate(status: UpdateStatus | null): OfferedState | null {
  if (status === null || status.managed !== null) return null;
  const { state } = status;
  return (SHOWN as readonly string[]).includes(state.kind) ? (state as OfferedState) : null;
}

/** What the dialog's confirming button does. */
export type UpdateDialogAction = "download" | "restart" | "close";

/** The dialog's confirming button for one state (`settings.update-dialog`). */
export interface UpdateDialogConfirm {
  readonly action: UpdateDialogAction;
  readonly label: string;
  /** While downloading, the button shows this and waits: the download ends in Restart. */
  readonly waiting: string | null;
}

/** Install, then Restart once downloaded; Try again after a failed download; Close when it can't install. */
export function dialogConfirm(state: OfferedState): UpdateDialogConfirm {
  switch (state.kind) {
    case "available":
      return { action: "download", label: text.INSTALL, waiting: null };
    case "downloading":
      return { action: "restart", label: text.RESTART, waiting: text.DOWNLOADING };
    case "download-failed":
      return { action: "download", label: TRY_AGAIN, waiting: null };
    case "signature-mismatch":
      return { action: "close", label: text.CLOSE, waiting: null };
    case "ready":
      return { action: "restart", label: text.RESTART, waiting: null };
  }
}

/** What changed up to an offered version and where its release page is. */
export interface OfferedNotes {
  /** Each version's notes, newest first; empty when the manifest had none. */
  readonly versions: readonly VersionNotes[];
  /** The list stops above the installed version: the older notes are on the release page. */
  readonly older: boolean;
  readonly notesUrl: string | null;
}

const NO_NOTES: OfferedNotes = { versions: [], older: false, notesUrl: null };

/** The notes each page's updater has offered, by version: a download's states don't carry them. */
const notesSeen = new WeakMap<UpdaterHost, Map<string, OfferedNotes>>();

/**
 * The notes up to the offered version: the state's own when it has them (available, ready), else
 * those the same updater offered for that version before the download started. The title bar
 * button sees every state, so it remembers them for the dialog.
 */
export function notesFor(host: UpdaterHost, state: OfferedState): OfferedNotes {
  const seen = notesSeen.get(host) ?? new Map<string, OfferedNotes>();
  notesSeen.set(host, seen);
  if (state.kind === "available" || state.kind === "ready") {
    // A shell before HAL-19545's list sends only the offered version's own notes.
    const own = state.notes === undefined ? [] : [{ version: state.version, notes: state.notes }];
    const notes = {
      versions: state.releaseNotes ?? own,
      older: state.olderOnReleasePage === true,
      notesUrl: state.notesUrl,
    };
    seen.set(state.version, notes);
    return notes;
  }
  return seen.get(state.version) ?? NO_NOTES;
}
