import type { MouseEvent } from "react";

/**
 * The box every text field draws (Input, TextArea, and Select later): one look per state,
 * picked in code rather than stacked as competing variants, so an error's edge never loses to a
 * hover.
 */

/** Which look the box has. A field with an error that is also read-only shows the error. */
export type FieldBoxState = "default" | "invalid" | "read-only" | "disabled";

/** `md` is 32px, the default; `sm` 28px. Both are 48px on a phone. */
export type FieldSize = "sm" | "md";

const shared = [
  "flex w-full gap-2 rounded-sm border px-2.5 transition-colors",
  "phone:min-h-touch phone:px-3",
  // A tablet's coarse pointer gets lg, like the Buttons beside it (component specs 23.5). The box
  // takes the whole tap, so it needs no hit area of its own. A phone is also coarse; not-phone:
  // keeps the 40px off it, so the phone's 48px holds whatever order the variants are written in.
  "touch:not-phone:min-h-control-lg",
].join(" ");

const stateClasses: Record<FieldBoxState, string> = {
  default: "border-border-control bg-surface hover:border-fg-muted focus-field",
  invalid: "border-danger bg-surface focus-field-danger",
  // Like the default, without the hover; the text stays selectable.
  "read-only": "border-border-control bg-surface-subtle focus-field",
  disabled: "cursor-not-allowed border-border bg-surface-subtle text-fg-disabled",
};

const sizeClasses: Record<FieldSize, string> = {
  sm: "min-h-control-sm",
  md: "min-h-control-md",
};

/**
 * The text inside the box: the value, the placeholder, and 16px on a phone or under a touch
 * pointer, so it doesn't zoom and stays in step with the taller box.
 */
export const fieldTextClasses = [
  "min-w-0 flex-1 bg-transparent text-body outline-none phone:text-input-touch",
  "touch:text-input-touch",
  "placeholder:text-fg-subtle disabled:text-fg-disabled disabled:placeholder:text-fg-disabled",
  // The browser draws the cursor of the element under the pointer, so the text needs it too.
  "disabled:cursor-not-allowed",
].join(" ");

/**
 * The box's `onMouseDown`: a press anywhere in the box puts the caret in its text, as in a native
 * text box, including the padding round the text and the leading icon. A press on the text itself
 * is left to the browser, which places the caret where it lands, and so is a press on a button
 * in the box, which takes its own focus.
 */
export function focusTextOnPress(event: MouseEvent<HTMLElement>): void {
  // Only the main button: a right or middle press opens a menu or scrolls, and keeps focus put.
  if (event.button !== 0) {
    return;
  }
  const target = event.target as Element;
  if (target.closest("[data-field-text], button") !== null) {
    return;
  }
  const text = event.currentTarget.querySelector<HTMLElement>("[data-field-text]");
  if (text === null) {
    return;
  }
  event.preventDefault();
  text.focus();
}

/** How the box lines up its content: `center` for one line, `start` for a TextArea's lines. */
export type FieldBoxAlign = "center" | "start";

const alignClasses: Record<FieldBoxAlign, string> = {
  center: "items-center",
  start: "items-start",
};

/** The box's classes for a state, a size and an alignment. */
export function fieldBoxClasses(
  state: FieldBoxState,
  size: FieldSize,
  align: FieldBoxAlign = "center",
): string {
  return `${shared} ${alignClasses[align]} ${stateClasses[state]} ${sizeClasses[size]}`;
}

/** Which look a field has, from its props and its Field. Disabled wins, then an error. */
export function fieldBoxState(flags: {
  disabled: boolean | undefined;
  invalid: boolean;
  readOnly: boolean | undefined;
}): FieldBoxState {
  if (flags.disabled === true) {
    return "disabled";
  }
  if (flags.invalid) {
    return "invalid";
  }
  if (flags.readOnly === true) {
    return "read-only";
  }
  return "default";
}
