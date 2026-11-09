import type { ReactNode } from "react";
import type { ListRow } from "./list-props.ts";

/*
 * The parts of a List row's main cell besides its title: the icon or avatar, and the line under
 * the title. Split out of list.tsx by concept.
 */

/**
 * The row's icon or avatar. `small` is a 32px `dense` row; a dense row 48px high, on a phone or
 * under a coarse pointer, keeps 20px.
 */
export function Leading({ row, small }: { readonly row: ListRow; readonly small: boolean }) {
  const dim = row.unavailable !== undefined;
  if (row.avatar !== undefined) {
    return (
      <span aria-hidden="true" className={`size-7 shrink-0 ${dim ? "opacity-45" : ""}`}>
        {row.avatar}
      </span>
    );
  }
  if (row.icon !== undefined) {
    return (
      <span
        aria-hidden="true"
        className={`inline-grid ${small ? "size-icon-sm touch:size-icon-md" : "size-icon-md"} shrink-0 place-items-center *:size-full ${dim ? "text-fg-disabled text-forced-disabled" : "text-fg-muted"}`}
      >
        {row.icon}
      </span>
    );
  }
  return null;
}

interface MetaLineProps {
  readonly row: ListRow;
  readonly text: string | undefined;
  readonly id: string;
  /** On a phone next to a More button, the chip starts the last line (kit 6). */
  readonly chip: ReactNode;
}

/**
 * The line under the title: the meta text, an error's reason or why the row is unavailable. With
 * a chip, the chip comes first and only the text is cut; without text, the chip has the line alone.
 */
export function MetaLine({ row, text, id, chip }: MetaLineProps) {
  if (text === undefined && chip === undefined) {
    return null;
  }
  // An unavailable row's reason stays at full strength, so it can be read (VRK 0.6).
  let colour = "text-fg-muted";
  if (row.error !== undefined && row.unavailable === undefined) {
    colour = "text-danger";
  }
  const line =
    text === undefined ? null : (
      <span
        id={row.unavailable === undefined ? undefined : id}
        className={`truncate text-small ${colour}`}
      >
        {text}
      </span>
    );
  if (chip === undefined) {
    return line;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0">{chip}</span>
      {line === null ? null : <span className="flex min-w-0">{line}</span>}
    </span>
  );
}
