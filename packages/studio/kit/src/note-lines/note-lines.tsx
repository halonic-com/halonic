import { InfoIcon } from "../icons/info-icon.tsx";

/** The props of `NoteLines`. */
export interface NoteLinesProps {
  /** The list's accessible name: "Notes on this run". */
  readonly label: string;
  /**
   * The notes, one line each, in the order given, shown as plain text: "Left out temperature:
   * claude-sonnet-5-5 doesn't take it." A note from outside Halonic comes with its hidden
   * characters already escaped (`escapeHidden` from `@halonicjs/std`).
   */
  readonly notes: readonly string[];
}

/**
 * Calm facts at the end of a section, such as a provider's notes after a run's steps: one line per
 * note, the 16px info mark and the sentence in `text-small` `fg-muted`, 4px apart and inset 16px.
 * No box, fill or status colour, no action, not dismissible and not a live region: background
 * information, read in order. A note is never shortened; it wraps under itself, not under the
 * mark. No notes, nothing.
 *
 * @example
 * <NoteLines label="Notes on this run" notes={providerNotes(log)} />
 */
export function NoteLines({ label, notes }: NoteLinesProps) {
  if (notes.length === 0) {
    return null;
  }
  return (
    <ul aria-label={label} className="flex flex-col gap-1 px-4">
      {notes.map((note, index) => (
        // The caller's notes are usually distinct, but the position keeps a repeat from clashing.
        <li key={`${index}-${note}`} className="flex items-start gap-3 text-small text-fg-muted">
          <span
            className="mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center *:size-full"
            aria-hidden="true"
          >
            <InfoIcon />
          </span>
          <p className="min-w-0 flex-1 wrap-break-word">{note}</p>
        </li>
      ))}
    </ul>
  );
}
