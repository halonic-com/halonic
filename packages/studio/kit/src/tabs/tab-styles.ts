/** The three looks: a track as wide as its tabs, a track across the column, and a column of rows. */
export type Layout = "inline" | "fill" | "vertical";

/** The tab list's own box in each look. */
export const trackClasses = {
  inline: "inline-flex max-w-full gap-0.5 rounded-sm bg-surface-muted p-0.5",
  // A fill tab is never narrower than its longest word, so tabs whose words don't fit side by side
  // (large text) go on to a second row rather than push the page sideways.
  fill: "flex w-full flex-wrap gap-0.5 rounded-sm bg-surface-muted p-0.5",
  vertical: "flex flex-col gap-1",
} as const;

/** Keeps `Tabs`' list at the top of the scroll area. */
export const stickyClasses = "sticky top-0 z-(--layer-sticky) bg-surface";

/** A tab's shape, text size and focus ring in each look. */
export const tabClasses = {
  inline: "rounded-segment text-small transition-colors focus-ring",
  fill: "rounded-segment text-small transition-colors focus-ring",
  vertical: "rounded-sm text-body transition-colors focus-ring",
} as const;

/**
 * On desktop a tab is as wide as its label. On a touch screen it renders at 40px with a 48px hit
 * area, like a small button.
 */
export const sizeClasses = {
  // On one line at normal text. When the track is wider than its column (200% text), the labels
  // wrap inside their tabs rather than overflow; the track keeps the tabs one height.
  inline: [
    "inline-flex min-h-control-sm min-w-0 items-center gap-1.5 px-3",
    "text-center hyphens-auto wrap-break-word",
    "touch:min-h-control-lg touch:hit-touch",
  ].join(" "),
  // The label wraps between words and the counter follows it like one more word. The tabs take
  // equal parts, but a tab is never narrower than its longest word (a flex item's own minimum
  // width), so "Behaviour" stays whole at 320px and the others share what's left (HAL-13044). No
  // hyphens: a hyphenation point would shrink that minimum to the word's longest piece. Only a
  // word wider than the whole track, where max-w-full caps the minimum, breaks.
  fill: "min-h-touch max-w-full flex-1 basis-0 px-2 py-1 text-center wrap-break-word",
  // A nav row: 32px, 48px on a touch screen. A long label wraps and the row grows with it.
  vertical: [
    "flex min-h-control-md w-full items-center gap-2 px-3 py-1",
    "text-start hyphens-auto wrap-break-word touch:min-h-touch",
  ].join(" "),
} as const;

/** The selected label's weight. `InlineLabel`'s width copy uses it too, so the two never drift. */
export const selectedWeight = "font-medium";

const disabledClasses = "cursor-not-allowed text-fg-disabled text-forced-disabled";

const segmentStateClasses = {
  // selected-forced is the selected tab's edge in high contrast, which drops the fill and the
  // shadow (component specs 23 A11, 23.5). The focus ring's own outline wins on focus.
  selected: `bg-surface ${selectedWeight} text-fg shadow-1 selected-forced`,
  default: "text-fg-muted hover:text-fg",
  disabled: disabledClasses,
} as const;

/** A vertical list's rows look like the kit's selected list rows: an accent tint, no shadow. */
const rowStateClasses = {
  selected: `bg-accent-soft ${selectedWeight} text-fg selected-forced`,
  default: "text-fg-muted hover:bg-surface-subtle hover:text-fg",
  disabled: disabledClasses,
} as const;

/** Whether a tab is selected, can't be opened, or neither. */
export type TabState = keyof typeof segmentStateClasses;

/** A tab's colours and weight for each state, in each look. */
export const stateClasses = {
  inline: segmentStateClasses,
  fill: segmentStateClasses,
  vertical: rowStateClasses,
} as const;

const iconSlot = "inline-grid size-icon-sm shrink-0 place-items-center *:size-full";

/**
 * In `fill` the tab is laid out as text so the label can wrap, so the icon needs its own gap: the
 * same 6px as the `gap-1.5` of `inline`.
 */
export const iconClasses = {
  inline: iconSlot,
  fill: `${iconSlot} me-1.5 align-middle`,
  vertical: iconSlot,
} as const;
