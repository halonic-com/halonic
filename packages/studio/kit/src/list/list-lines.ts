/** A bordered List in its box, or a `flush` one: the phone's form. */
export type ListLook = "bordered" | "flush";

/**
 * The 1px line above every row but the first. In a flush list it starts at 16px, with the text.
 * Shared by the real rows and the skeleton rows, so the two line up.
 */
export const lineClasses = {
  bordered: { main: "border-t border-border", more: "border-t border-border" },
  flush: {
    // A border, not a fill, so forced colours keep it.
    main: "relative before:absolute before:top-0 before:right-0 before:left-4 before:h-0 before:border-t before:border-border",
    more: "border-t border-border",
  },
} as const satisfies Record<ListLook, { main: string; more: string }>;

/**
 * The box round a bordered List, real or loading. Not `overflow-hidden`, which would cut the focus
 * rings of the first and last rows: the corner cells carry the radius instead.
 */
export const boxClasses: Record<ListLook, string> = {
  bordered: "rounded-md border border-border",
  flush: "",
};
