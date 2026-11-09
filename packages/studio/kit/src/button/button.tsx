import type { MouseEvent, ReactNode, Ref } from "react";
import { Spinner } from "./spinner.tsx";

/** What the button does: `primary` once per view, `ghost` for Cancel, `danger` only to confirm. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/**
 * The button's height: `sm` 28px, `md` 32px (the default), `lg` 40px. `touch` is 48px, for a
 * phone's bottom bar and a sheet's confirming button.
 */
export type ButtonSize = "sm" | "md" | "lg" | "touch";

/** Why a button can't be used right now, written as visible text next to it. */
export interface ButtonUnavailable {
  /** The `id` of the visible text that says why: "Finish getting updates first." */
  readonly reason: string;
}

interface ButtonBase {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Full width, as a bottom bar's or a sheet's confirming button usually is. */
  readonly block?: boolean;
  /** While its request runs: a spinner, `aria-busy`, and clicks ignored. Never `disabled`. */
  readonly busy?: boolean;
  /**
   * The button can't be used now. It stays focusable, ignores clicks and points screen readers
   * at the reason. There's no `disabled` prop on purpose (component specs 23, A1).
   */
  readonly unavailable?: ButtonUnavailable;
  /** `submit` only for a form's confirming button. */
  readonly type?: "button" | "submit";
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** A button with words: "New agent", "Delete agent". Never "OK". */
interface ButtonWithLabel extends ButtonBase {
  /** The label: a verb that says what happens. */
  readonly children: ReactNode;
  /** An optional 16px icon on the left. */
  readonly icon?: ReactNode;
  readonly label?: never;
}

/** A square button with only an icon. */
interface IconButton extends ButtonBase {
  readonly icon: ReactNode;
  /** Its name, saying what and which: "Close Support reply", "More actions for Sorter". */
  readonly label: string;
  readonly children?: never;
}

export type ButtonProps = ButtonWithLabel | IconButton;

const shared = [
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm text-body-strong",
  "transition-colors focus-ring",
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
].join(" ");

/**
 * Hover changes only a fill or a text colour, and a press shows the hover fill at once. Neither
 * applies while the button is unavailable.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-primary text-on-primary",
    "not-aria-disabled:hover:bg-primary-hover not-aria-disabled:active:bg-primary-hover",
  ].join(" "),
  secondary: [
    "border border-border-strong bg-surface text-fg",
    "not-aria-disabled:hover:bg-surface-subtle not-aria-disabled:active:bg-surface-subtle",
  ].join(" "),
  ghost: [
    "text-fg-muted",
    "not-aria-disabled:hover:bg-surface-muted not-aria-disabled:hover:text-fg",
    "not-aria-disabled:active:bg-surface-muted not-aria-disabled:active:text-fg",
  ].join(" "),
  danger: [
    "bg-danger text-on-danger",
    "not-aria-disabled:hover:bg-danger-hover not-aria-disabled:active:bg-danger-hover",
  ].join(" "),
};

/** On a phone and on a touch screen, sm and md render at lg with a 48px hit area. */
const asLargeOnTouch = "phone:min-h-control-lg phone:px-4 touch:min-h-control-lg touch:px-4";
const hitArea = "phone:hit-touch touch:hit-touch";

const sizeClasses: Record<ButtonSize, string> = {
  sm: `min-h-control-sm px-2.5 whitespace-nowrap ${asLargeOnTouch} ${hitArea}`,
  md: `min-h-control-md px-3 whitespace-nowrap ${asLargeOnTouch} ${hitArea}`,
  lg: `min-h-control-lg px-4 whitespace-nowrap ${hitArea}`,
  // A touch label wraps between words, so at large text the button grows taller, not wider.
  touch: "min-h-touch px-4 py-2 text-center",
};

/** Icon buttons are squares; on a phone and a touch screen, 48px with a 20px icon. */
const iconButtonClasses: Record<ButtonSize, string> = {
  sm: "size-control-sm phone:size-touch touch:size-touch",
  md: "size-control-md phone:size-touch touch:size-touch",
  lg: "size-control-lg phone:size-touch touch:size-touch",
  touch: "size-touch",
};

const iconSlot = "inline-grid size-icon-sm shrink-0 place-items-center *:size-full";
const largeIconSlot = "phone:size-icon-md touch:size-icon-md";

/**
 * The kit's button: a native `<button>`, `type="button"` unless it submits a form. With `icon`
 * and `label` and no children it's an icon button.
 *
 * A button that can't be used takes `unavailable={{ reason }}` instead of `disabled`, so it stays
 * in the Tab order and screen readers hear why. A button whose request runs is `busy`.
 *
 * @example
 * <Button variant="primary" onClick={create}>New agent</Button>
 * <Button variant="ghost" icon={<CloseIcon />} label="Close Support reply" onClick={close} />
 * <Button unavailable={{ reason: "updates-reason" }}>Make a version</Button>
 */
export function Button(props: ButtonProps) {
  const { variant = "secondary", size = "md", block = false, busy = false, unavailable } = props;
  const isIconButton = props.label !== undefined;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (busy || unavailable !== undefined) {
      // Also stops a submit button from submitting its form.
      event.preventDefault();
      return;
    }
    props.onClick?.(event);
  }

  const classes = [
    shared,
    variantClasses[variant],
    isIconButton ? iconButtonClasses[size] : sizeClasses[size],
    block ? "w-full" : "",
  ].join(" ");

  const icon = busy ? <Spinner /> : props.icon;
  const iconClasses = isIconButton ? `${iconSlot} ${largeIconSlot}` : iconSlot;

  return (
    <button
      ref={props.ref}
      type={props.type ?? "button"}
      className={classes.trim()}
      aria-label={props.label}
      aria-busy={busy || undefined}
      aria-disabled={unavailable === undefined ? undefined : true}
      aria-describedby={unavailable?.reason}
      onClick={handleClick}
    >
      {icon === undefined ? null : (
        <span className={iconClasses} aria-hidden="true">
          {icon}
        </span>
      )}
      {props.children}
    </button>
  );
}
