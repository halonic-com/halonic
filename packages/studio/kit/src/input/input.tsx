import type { InputHTMLAttributes, KeyboardEvent, ReactNode, Ref } from "react";
import { InFieldBoxContext } from "../button/button.tsx";
import { describedBy } from "../field/control.ts";
import { useFieldControl } from "../field/field.tsx";
import { isComposing } from "../keyboard/is-composing.ts";
import {
  type FieldLook,
  type FieldSize,
  type FieldWidth,
  fieldBoxClasses,
  fieldBoxState,
  fieldTextClasses,
  focusTextOnPress,
  promptBoxClasses,
  shortTextClasses,
} from "./field-box.ts";
import { type InputLeadingButton, LeadingButton } from "./leading-button.tsx";

/** What the kit sets itself, from the Field and its own look, and a screen can't override. */
type OwnedAttributes =
  | "className"
  | "style"
  | "id"
  | "size"
  | "aria-invalid"
  | "aria-describedby"
  | "aria-required";

// The native `width` is an image button's; the kit's `width` is the box's width instead.
interface InputBase extends Omit<InputHTMLAttributes<HTMLInputElement>, OwnedAttributes | "width"> {
  /** `md` 32px (the default) or `sm` 28px. Both are 48px on a phone. */
  readonly size?: FieldSize;
  /**
   * `full` (the default) fills the column; `short` fits about 6 characters, for a small number
   * such as a turn limit, so the box doesn't suggest a long value. Never narrower than 48px.
   */
  readonly width?: FieldWidth;
  /**
   * A button at the end of the box (clear, show): a ghost icon `Button`. It keeps the `sm` look on
   * a phone, with a 48px hit area, so the box stays 48px.
   */
  readonly trailing?: ReactNode;
  /** The `id` of a line outside the Field that also describes the control, read after the Field's own. */
  readonly describedBy?: string;
  /**
   * For an error shown outside the Field (a Callout next to the control), whose `id` goes in
   * `describedBy`: the box gets the error look and the text `aria-invalid`, as with the Field's
   * own error. The Field's error still counts when this is false.
   */
  readonly invalid?: boolean;
  /** Mono text, for a value that is code: a model id, a secret name, a URL. */
  readonly mono?: boolean;
  /**
   * `prompt` only for a search you type to start something, such as the Messenger's chat search:
   * a 40px pill with the soft edge and shadow (HAL-19142). It takes no `size` or `width`.
   */
  readonly look?: FieldLook;
  readonly ref?: Ref<HTMLInputElement>;
}

/** The start of the box holds an icon or a button, never both (component specs 3, revision 14). */
type InputLeading =
  | {
      /** A 16px icon at the start of the box, in `fg-muted`: the search glass. */
      readonly leadingIcon?: ReactNode;
      readonly leadingButton?: never;
    }
  | {
      /**
       * A small button at the start of the box: the colour field's swatch, which opens its
       * popover. Disabled while the Input is disabled or read-only.
       */
      readonly leadingButton: InputLeadingButton;
      readonly leadingIcon?: never;
    };

/** The props of `Input`. */
export type InputProps = InputBase & InputLeading;

/**
 * A one-line text field. Put it in a `Field`, which gives it its label, its hint or error, and
 * the ids that link them. Enter submits its form, except while an input method is composing.
 *
 * @example
 * <Field label="Name" error={nameError}>
 *   <Input value={name} onChange={(event) => setName(event.target.value)} />
 * </Field>
 */
export function Input({
  size = "md",
  width = "full",
  leadingIcon,
  leadingButton,
  trailing,
  mono = false,
  look = "field",
  describedBy: extraDescription,
  invalid: invalidOutside = false,
  ref,
  onKeyDown,
  ...native
}: InputProps) {
  const field = useFieldControl();
  const invalid = invalidOutside || (field?.invalid ?? false);
  const state = fieldBoxState({ disabled: native.disabled, invalid, readOnly: native.readOnly });

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && isComposing(event)) {
      // The Enter that picks a word must not submit the form.
      event.preventDefault();
      return;
    }
    onKeyDown?.(event);
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a mouse convenience only; the keyboard reaches the text itself.
    <div
      className={
        look === "prompt"
          ? `${promptBoxClasses(state)} min-h-control-lg px-4 phone:min-h-touch`
          : fieldBoxClasses(state, size, "center", width)
      }
      onMouseDown={focusTextOnPress}
    >
      {leadingButton === undefined ? null : (
        <LeadingButton
          button={leadingButton}
          disabled={state === "disabled" || native.readOnly === true}
        />
      )}
      {leadingIcon === undefined ? null : (
        <span
          className="inline-grid size-icon-sm shrink-0 place-items-center text-fg-muted *:size-full"
          aria-hidden="true"
        >
          {leadingIcon}
        </span>
      )}
      <input
        {...native}
        ref={ref}
        id={field?.id}
        data-field-text=""
        data-text-entry=""
        className={textClasses(width, mono)}
        aria-describedby={describedBy(field?.describedBy, extraDescription)}
        aria-invalid={invalid || undefined}
        aria-required={field?.required || undefined}
        onKeyDown={handleKeyDown}
      />
      <InFieldBoxContext value={true}>{trailing}</InFieldBoxContext>
    </div>
  );
}

/**
 * The text's classes. It is as tall as the box, so a press above or below the line of text lands
 * on it.
 */
function textClasses(width: FieldWidth, mono: boolean): string {
  const classes = [fieldTextClasses, "self-stretch"];
  if (width === "short") classes.push(shortTextClasses);
  if (mono) classes.push("font-mono");
  return classes.join(" ");
}
