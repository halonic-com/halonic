import { InfoIcon, usePresentation } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";

/** The props of {@link NameAndHubRow}. */
export interface NameAndHubRowProps {
  /** The Name field. */
  readonly name: ReactNode;
  /** The Hub field, or `undefined` when there is only one hub. */
  readonly hub?: ReactNode;
}

/**
 * The Name field of a "New …" dialog, with the Hub picker when there is more than one hub. On a
 * computer the picker sits at the right of the name, 160px wide. A phone has no room for both, so
 * the picker goes under the name. Either way the name's column may shrink below its input's own
 * width, so the row never grows past the dialog: an `auto` column would be at least as wide as the
 * input, and at 195px the sheet would scroll sideways and cut the labels (HAL-14648).
 *
 * @example
 * <NameAndHubRow name={<Field label="Name">…</Field>} hub={<Field label="Hub">…</Field>} />
 */
export function NameAndHubRow({ name, hub }: NameAndHubRowProps) {
  const phone = usePresentation() === "phone";
  const columns =
    hub !== undefined && !phone ? "grid-cols-[minmax(0,1fr)_160px]" : "grid-cols-[minmax(0,1fr)]";
  return (
    <div className={`grid gap-3 ${columns}`}>
      {name}
      {hub}
    </div>
  );
}

/** The props of {@link NewItemNote}. */
export interface NewItemNoteProps {
  /** The line's id, which the dialog passes as `describedBy`, so a screen reader reads it on opening. */
  readonly id: string;
  /** The line's text. Never shortened: it wraps. */
  readonly children: ReactNode;
}

/**
 * The info line of a "New …" dialog, saying what the new item starts as. The 16px icon sits on
 * the first line when the text wraps. The dialog names the line as its description (UX 2.1).
 *
 * @example
 * <Dialog describedBy={noteId} …>
 *   <NewItemNote id={noteId}>It starts with a step “start” that leads to “done”.</NewItemNote>
 * </Dialog>
 */
export function NewItemNote({ id, children }: NewItemNoteProps) {
  return (
    <p id={id} className="flex items-start gap-2 text-small text-fg-muted">
      {/* The icon has no size of its own: in a flex row it would shrink to nothing. */}
      <span
        className="mt-0.5 inline-grid size-icon-sm shrink-0 text-fg-subtle *:size-full"
        aria-hidden
      >
        <InfoIcon />
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
