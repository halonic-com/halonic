/**
 * The width a card docked beside the page's body gets: 480 px, or the body's whole width when that
 * would leave what it sits beside under 320 px, that is in a body under 800 px (DW1, WCAG 1.4.10).
 * The body is the `@container` the card measures, so a 200 % zoom on a desktop window gets the
 * phone's layout (`besideDockedCard` hides the rest) and nothing reads the window's width.
 */
const dockedWidth = "w-120 max-w-full @max-[800px]:w-full";

/** The frame of the start card, the run card and the step card when docked. */
export const dockedCard = `flex ${dockedWidth} shrink-0 flex-col gap-4 overflow-auto border-s border-border bg-surface-raised p-6 shadow-2`;

/**
 * What sits beside a docked card hides at the width where the card takes the body: there the
 * canvas or the list would have under 320 px. A phone hides it outright.
 */
export const besideDockedCard = "@max-[800px]:hidden";
