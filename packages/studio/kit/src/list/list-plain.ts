/*
 * A `plain` List's row fills and corners, as `PlainRow`'s (HAL-19192, `kit.list-plain`): no fill
 * at rest, the muted fill on hover and on the current row, every row rounded. Kept apart from
 * list-row.tsx, which keeps the bordered and flush looks.
 */

import type { PlainRowUnread } from "../plain-list/unread-mark.tsx";
import type { AnyListRow } from "./list-props.ts";

/** A row state's classes: the cells' fill, the row's own, and the main cell's. */
export interface RowStateClasses {
  readonly fill: string;
  readonly row: string;
  readonly main: string;
}

/**
 * The fills of a plain row in each state. Keyboard focus in a row gives it the hover fill, so
 * its `hoverAction`, shown then too, sits on the fill (HAL-20148). The current row keeps
 * `selected-forced`, so forced colours still outline it, but no accent bar: the fill alone marks
 * it, as in the Messenger.
 */
export const plainStateClasses = {
  default: {
    fill: [
      "transition-colors group-hover:bg-surface-muted group-active:bg-surface-muted",
      "group-has-[:focus-visible]:bg-surface-muted",
    ].join(" "),
    row: "",
    main: "",
  },
  selected: { fill: "bg-surface-muted", row: "selected-forced", main: "" },
  unavailable: { fill: "", row: "", main: "" },
  inert: { fill: "", row: "", main: "" },
} as const satisfies Record<string, RowStateClasses>;

/**
 * How a plain row marks its muted fill in each state, so a neutral fill on it, such as an Avatar's
 * tile, steps up with `on-muted:` (`kit.avatar-on-row-fill`): muted on hover, press and keyboard
 * focus at rest, muted while selected or current, and not at all while unavailable or inert, as
 * the fills above. Keyboard focus is `data-focus-visible-fill`: a click's focus fills nothing.
 */
export const plainFillMarks = {
  default: { "data-hover-fill": "muted", "data-focus-visible-fill": "muted" },
  selected: { "data-fill": "muted" },
  unavailable: {},
  inert: {},
} as const satisfies Record<keyof typeof plainStateClasses, Record<string, string>>;

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

/**
 * How many grid cells a row's buttons take after its main cell: its `actions`, then its
 * `hoverAction`, which only a `plain` List draws.
 */
export function actionCount(row: AnyListRow, plain: boolean): number {
  const hoverAction = plain && row.hoverAction !== undefined ? 1 : 0;
  return (row.actions?.length ?? 0) + hoverAction;
}
