import { ChevronRightIcon, PlaceIcon, type PlaceIconName, PlusIcon } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";

/**
 * The stacked map's rows (`agents.map.stacked`, component specs 15.8): a flush list's rows, each at
 * least 56 px high, with a 20 px icon for its kind, then the name in `text-body-strong` over one
 * detail line, either of which may wrap, since this view is there for larger text. A row that
 * opens something ends in a chevron. Rows run edge to edge, so they take the inset focus ring,
 * which the panel can't clip (component specs 0 and 6).
 */
export const stackedRowBaseClasses =
  "flex min-h-14 w-full items-center gap-3 py-2 text-start text-fg wrap-break-word";

/** A stacked row with its icon at the start: 16 px in, then the icon and a 12 px gap. */
export const stackedRowClasses = `${stackedRowBaseClasses} px-4`;

/** Where the stacked map's rows sit: one flush list, a line between rows. */
export const stackedRowsClasses = "flex flex-col divide-y divide-border border-y border-border";

/** One item as a row of the stacked map: a button where it opens something, else text. */
export function StackedRow({
  icon,
  name,
  detail,
  label,
  onOpen,
}: {
  /** The kit's place icon for its kind: `routines`, `workflows`, `agents` or `library`. */
  readonly icon: PlaceIconName;
  readonly name: ReactNode;
  readonly detail: ReactNode;
  /** Its accessible name, when its text doesn't say enough. */
  readonly label?: string | undefined;
  readonly onOpen?: (() => void) | undefined;
}) {
  const text = (
    <>
      <span className="size-icon-md shrink-0 text-fg-muted *:size-full">
        <PlaceIcon name={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-strong">{name}</span>
        <span className="text-small text-fg-muted">{detail}</span>
      </span>
    </>
  );
  if (onOpen === undefined) {
    return (
      <div data-map-card="" className={stackedRowClasses}>
        {text}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-map-card=""
      aria-label={label}
      className={`${stackedRowClasses} hover:bg-surface-subtle focus-ring-inset`}
      onClick={onOpen}
    >
      {text}
      <span className="size-icon-md shrink-0 text-fg-subtle *:size-full">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

/**
 * A side's add button as the stacked map's last row: 48 px, a plus and its words in the accent. The
 * plus sits where the other rows have their icon, so its words line up with their names.
 */
export function StackedAddRow({
  label,
  onAdd,
}: {
  readonly label: string;
  readonly onAdd: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-touch w-full items-center gap-3 px-4 py-2 text-start text-body-strong text-accent-text hover:bg-surface-subtle focus-ring-inset"
      onClick={onAdd}
    >
      <span className="size-icon-md shrink-0 *:size-full">
        <PlusIcon />
      </span>
      {label}
    </button>
  );
}
