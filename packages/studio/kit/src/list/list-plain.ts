/*
 * A `plain` List's row fills and corners, as `PlainRow`'s (HAL-19192, `kit.list-plain`): no fill
 * at rest, the muted fill on hover and on the current row, every row rounded. Kept apart from
 * list-row.tsx, which keeps the bordered and flush looks.
 */

import type { PlainRowUnread } from "../plain-list/unread-mark.tsx";

/** A row state's classes: the cells' fill, the row's own, and the main cell's. */
export interface RowStateClasses {
  readonly fill: string;
  readonly row: string;
  readonly main: string;
}

/**
 * The fills of a plain row in each state. The current row keeps `selected-forced`, so forced
 * colours still outline it, but no accent bar: the fill alone marks it, as in the Messenger.
 */
export const plainStateClasses = {
  default: {
    fill: "transition-colors group-hover:bg-surface-muted group-active:bg-surface-muted",
    row: "",
    main: "",
  },
  selected: { fill: "bg-surface-muted", row: "selected-forced", main: "" },
  unavailable: { fill: "", row: "", main: "" },
  inert: { fill: "", row: "", main: "" },
} as const satisfies Record<string, RowStateClasses>;

/** Every plain row is rounded on both ends, since there's no box round it. */
export function plainCorners(side: "left" | "right"): string {
  return side === "left" ? "rounded-l-md" : "rounded-r-md";
}

/**
 * A labelled plain row's name: its `label`, then the unread words while it's unread ("Approve the
 * notes, unread"), since the cell's `aria-label` hides the words drawn in its unread mark.
 */
export function plainRowLabel(
  label: string | undefined,
  unread: PlainRowUnread | undefined,
): string | undefined {
  if (label === undefined || unread === undefined) {
    return label;
  }
  return `${label}, ${`${unread.count ?? ""}${unread.label}`.trim()}`;
}
