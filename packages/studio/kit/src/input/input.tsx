import type { InputHTMLAttributes, KeyboardEvent, ReactNode, Ref } from "react";
import { InFieldBoxContext } from "../button/button.tsx";
import { useFieldControl } from "../field/field.tsx";
import { isComposing } from "../keyboard/is-composing.ts";
import {
  type FieldSize,
  fieldBoxClasses,
  fieldBoxState,
  fieldTextClasses,
  focusTextOnPress,
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

interface InputBase extends Omit<InputHTMLAttributes<HTMLInputElement>, OwnedAttributes> {
  /** `md` 32px (the default) or `sm` 28px. Both are 48px on a phone. */
  readonly size?: FieldSize;
  /**
   * A button at the end of the box (clear, show): a ghost icon `Button`. It keeps the `sm` look on
   * a phone, with a 48px hit area, so the box stays 48px.
   */
  readonly trailing?: ReactNode;
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
  leadingIcon,
  leadingButton,
  trailing,
  ref,
  onKeyDown,
  ...native
}: InputProps) {
  const field = useFieldControl();
  const invalid = field?.invalid ?? false;
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
    <div className={fieldBoxClasses(state, size)} onMouseDown={focusTextOnPress}>
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
        // As tall as the box, so a press above or below the line of text lands on it.
        className={`${fieldTextClasses} self-stretch`}
        aria-describedby={field?.describedBy}
        aria-invalid={invalid || undefined}
        aria-required={field?.required || undefined}
        onKeyDown={handleKeyDown}
      />
      <InFieldBoxContext value={true}>{trailing}</InFieldBoxContext>
    </div>
  );
}
