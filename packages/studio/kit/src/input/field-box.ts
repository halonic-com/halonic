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

/**
 * How wide the box is: `full`, the default, fills its column; `short` fits about 6 characters of
 * text, for a small number such as a turn limit.
 */
export type FieldWidth = "full" | "short";

const shared = [
  "flex gap-2 rounded-sm border px-2.5 transition-colors",
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

// A short box fits its content, and never gets narrower than the 48px touch target.
const widthClasses: Record<FieldWidth, string> = {
  full: "w-full",
  short: "w-fit min-w-touch",
};

/**
 * The width of the text inside a short box, in its own font, so it holds about 6 characters at
 * 14px and at the 16px of a phone alike. It still grows to fill the box, so a press anywhere in
 * the box lands on it.
 */
export const shortTextClasses = "w-input-short";

/**
 * The text inside the box: the value, the placeholder, and 16px on a phone or under a touch
 * pointer, so it doesn't zoom and stays in step with the taller box.
 */
const textShared = [
  "min-w-0 flex-1 bg-transparent outline-none phone:text-input-touch",
  "touch:text-input-touch",
  "placeholder:text-fg-subtle disabled:text-fg-disabled disabled:placeholder:text-fg-disabled",
  // The browser draws the cursor of the element under the pointer, so the text needs it too.
  "disabled:cursor-not-allowed",
].join(" ");

/** A field's text: 14px, and 16px on a phone or under a touch pointer. */
export const fieldTextClasses = `text-body ${textShared}`;

/** A prompt's text: the 15px of chat messages, on the 24px lines its round buttons need. */
export const promptTextClasses = `text-reading ${textShared}`;

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

/**
 * How the box lines up its content: `center` for one line, `start` for a TextArea's lines, `end`
 * for a prompt's, whose round buttons stay by its last line.
 */
export type FieldBoxAlign = "center" | "start" | "end";

const alignClasses: Record<FieldBoxAlign, string> = {
  center: "items-center",
  start: "items-start",
  end: "items-end",
};

/** The box's classes for a state, a size, an alignment and a width. */
export function fieldBoxClasses(
  state: FieldBoxState,
  size: FieldSize,
  align: FieldBoxAlign = "center",
  width: FieldWidth = "full",
): string {
  return `${shared} ${widthClasses[width]} ${alignClasses[align]} ${stateClasses[state]} ${sizeClasses[size]}`;
}

/**
 * `field`, the default, is a form field's clear edge. `prompt` is only for the boxes where you type
 * to an agent. On an `Input`, such as the chat search, it's the board's rounder search-box look,
 * with a soft edge and shadow, so it reads as "start here" (HAL-19142). On a `TextArea` it's the
 * chat's message box, the new design's pill (`composerBoxClasses`); only the `ChatComposer` uses it.
 */
export type FieldLook = "field" | "prompt";

// Its edge is see-through, so under More contrast it takes the 3:1 edge every other edge has.
const composerEdge = "border-border-composer contrast-more:border-border-control";

const promptStateClasses: Record<FieldBoxState, string> = {
  default: "border-border-prompt bg-surface-prompt shadow-prompt focus-prompt",
  invalid: "border-danger bg-surface-prompt shadow-prompt focus-field-danger",
  "read-only": "border-border-prompt bg-surface-subtle shadow-prompt focus-prompt",
  disabled: "cursor-not-allowed border-border bg-surface-subtle text-fg-disabled",
};

/**
 * A prompt box's classes for a state. It has no size: its height comes from what's in it, the round
 * buttons or the text, so one line is a full pill and the 24px corners stay as it grows.
 */
export function promptBoxClasses(state: FieldBoxState, align: FieldBoxAlign = "center"): string {
  const box = "flex w-full gap-2 rounded-prompt border transition";
  return `${box} ${alignClasses[align]} ${promptStateClasses[state]}`;
}

// The chat's message box in the new design (HAL-20728): the floating pill of Noah's recipe, with
// an edge that shows only on focus or an error and the composer's lighter shadow.
const composerStateClasses: Record<FieldBoxState, string> = {
  default: `${composerEdge} bg-surface-raised shadow-composer focus-prompt`,
  invalid: "border-danger bg-surface-raised shadow-composer focus-field-danger",
  "read-only": `${composerEdge} bg-surface-subtle shadow-composer focus-prompt`,
  disabled: "cursor-not-allowed border-border-composer bg-surface-subtle text-fg-disabled",
};

/**
 * The chat composer's box for a state: a prompt box with 26px corners at least 52px tall, on the
 * raised surface, its 1px edge see-through in light and the divider's in dark until focus or an
 * error (`kit.prompt-look`).
 */
export function composerBoxClasses(state: FieldBoxState, align: FieldBoxAlign = "center"): string {
  const box = "flex w-full gap-2 min-h-composer rounded-composer border transition";
  return `${box} ${alignClasses[align]} ${composerStateClasses[state]}`;
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
