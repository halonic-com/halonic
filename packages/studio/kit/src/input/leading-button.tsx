import type { ReactNode, Ref } from "react";

/** A small button at the start of an Input's box: the colour field's swatch (component specs 3). */
export interface InputLeadingButton {
  /**
   * Its name, in the feature's verb, with the value read with it: "Choose the first colour, now
   * #3B8BFF".
   */
  readonly label: string;
  /** Called on a click, Enter or Space. The text doesn't take focus. */
  readonly onClick: () => void;
  /** What it shows, 16px at most, drawn by the feature: the swatch of the last good colour. */
  readonly children: ReactNode;
  /**
   * Whether what it opens is open, for a button that opens a popover (`aria-haspopup="dialog"`).
   * Leave it out for a button that opens nothing.
   */
  readonly expanded?: boolean | undefined;
  /** The `id` of what it opens, while it's open. */
  readonly controls?: string | undefined;
  readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * A 24px hit area centred on the 16px glyph, 4px from the box's left edge: the box's 10px padding
 * less 6px. The box's 8px gap then starts the text 36px in. On a phone the hit area is the 48px
 * square at the left of the 48px box: it pulls back the box's 12px padding and reaches over its
 * 1px edge, so it's 48 by 48 from the outer edge, and the 8px gap starts the text at 56px, clear of
 * the button's focus ring. No fill of its own: a hover is the box's edge. Its focus is the general
 * ring, so it can't be mistaken for the text's.
 */
const buttonClasses = [
  "-ml-1.5 inline-grid size-6 shrink-0 cursor-pointer place-items-center rounded-xs focus-ring",
  "disabled:cursor-not-allowed disabled:opacity-45",
  "phone:-my-px phone:-ml-3.25 phone:h-auto phone:w-touch phone:self-stretch",
].join(" ");

/**
 * The Input's leading button. It's disabled whenever its Input is disabled or read-only, so a
 * view-only colour can't be changed from its swatch.
 */
export function LeadingButton({
  button,
  disabled,
}: {
  readonly button: InputLeadingButton;
  readonly disabled: boolean;
}) {
  return (
    <button
      type="button"
      ref={button.ref}
      className={buttonClasses}
      aria-label={button.label}
      aria-haspopup={button.expanded === undefined ? undefined : "dialog"}
      aria-expanded={button.expanded}
      aria-controls={button.expanded === true ? button.controls : undefined}
      // Inside the kit, so native disabled is allowed: it leaves the Tab order with its Input.
      disabled={disabled}
      onClick={button.onClick}
    >
      <span aria-hidden="true" className="inline-grid size-icon-sm place-items-center">
        {button.children}
      </span>
    </button>
  );
}
