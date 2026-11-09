import {
  createContext,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useContext,
} from "react";
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
  readonly onFocus?: (event: FocusEvent<HTMLButtonElement>) => void;
  /** `-1` only inside a grid, which moves focus with the arrow keys (a List row's More button). */
  readonly tabIndex?: 0 | -1;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** A button with words: "New agent", "Delete agent". Never "OK". */
interface ButtonWithLabel extends ButtonBase {
  /** The label: a verb that says what happens. */
  readonly children: ReactNode;
  /** An optional 16px icon on the left. */
  readonly icon?: ReactNode;
  /**
   * The label while `busy`: "Creating…". The button keeps the width of the wider of its two
   * labels, before, during and after, so nothing next to it moves.
   */
  readonly busyLabel?: string;
  readonly label?: never;
}

/** A square button with only an icon. */
interface IconButton extends ButtonBase {
  readonly icon: ReactNode;
  /** Its name, saying what and which: "Close Support reply", "More actions for Sorter". */
  readonly label: string;
  readonly children?: never;
  readonly busyLabel?: never;
}

export type ButtonProps = ButtonWithLabel | IconButton;

/**
 * Every button has a 1px edge, so Windows high-contrast mode, which drops fills, still draws its
 * shape (component specs 23.5). An unavailable button is 45%, 60% when more contrast is asked
 * for, and `GrayText` at full strength in high contrast, its edge as well as its text.
 */
const shared = [
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border text-body-strong",
  "transition-colors focus-ring",
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-45 contrast-more:aria-disabled:opacity-60",
  "aria-disabled:text-forced-disabled aria-disabled:border-forced-disabled",
  "forced-colors:aria-disabled:opacity-100",
].join(" ");

/**
 * Hover changes only a fill or a text colour, and a press shows the hover fill at once. Neither
 * applies while the button is unavailable. Only `secondary` shows its edge; the others keep it
 * see-through, each in its own variant so two edge colours never meet on one button.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "border-transparent bg-primary text-on-primary",
    "not-aria-disabled:hover:bg-primary-hover not-aria-disabled:active:bg-primary-hover",
  ].join(" "),
  secondary: [
    "border-border-strong bg-surface text-fg",
    "not-aria-disabled:hover:bg-surface-subtle not-aria-disabled:active:bg-surface-subtle",
  ].join(" "),
  ghost: [
    "border-transparent text-fg-muted",
    "not-aria-disabled:hover:bg-surface-muted not-aria-disabled:hover:text-fg",
    "not-aria-disabled:active:bg-surface-muted not-aria-disabled:active:text-fg",
  ].join(" "),
  danger: [
    "border-transparent bg-danger text-on-danger",
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

/**
 * Icon buttons are squares. On a touch screen they're 40px, like the text buttons beside them,
 * with the 48px hit area; on a phone 48px with a 20px icon. phone: wins where both apply.
 */
const iconButtonClasses: Record<ButtonSize, string> = {
  sm: "size-control-sm touch:size-control-lg touch:hit-touch phone:size-touch",
  md: "size-control-md touch:size-control-lg touch:hit-touch phone:size-touch",
  lg: "size-control-lg touch:hit-touch phone:size-touch",
  touch: "size-touch",
};

/**
 * Set by the Input round its trailing button. On a phone the field box is 48px, and a 48px button
 * inside its 1px border would make it 50px; so there an icon button keeps its `sm` look and gets
 * only the 48px hit area (component specs 3).
 */
export const InFieldBoxContext = createContext(false);
const inFieldBoxIconButton = `size-control-sm ${hitArea}`;

const iconSlot = "inline-grid size-icon-sm shrink-0 place-items-center *:size-full";
const largeIconSlot = "phone:size-icon-md";

/** One grid cell: the resting and the busy copy lie on top of each other in it. */
const busyCell = "inline-grid";
const busyCopy = "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5";

/**
 * The kit's button: a native `<button>`, `type="button"` unless it submits a form. With `icon`
 * and `label` and no children it's an icon button.
 *
 * A button that can't be used takes `unavailable={{ reason }}` instead of `disabled`, so it stays
 * in the Tab order and screen readers hear why. A button whose request runs is `busy`; give it a
 * `busyLabel` when its label changes then, so its width doesn't.
 *
 * @example
 * <Button variant="primary" onClick={create}>New agent</Button>
 * <Button variant="ghost" icon={<CloseIcon />} label="Close Support reply" onClick={close} />
 * <Button unavailable={{ reason: "updates-reason" }}>Make a version</Button>
 * <Button variant="primary" busy={creating} busyLabel="Creating…">Create</Button>
 */
export function Button(props: ButtonProps) {
  const { variant = "secondary", size = "md", block = false, busy = false, unavailable } = props;
  const isIconButton = props.label !== undefined;
  const inFieldBox = useContext(InFieldBoxContext) && isIconButton;

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
    buttonSizeClasses(size, isIconButton, inFieldBox),
    block ? "w-full" : "",
  ].join(" ");

  const iconClasses = isIconButton && !inFieldBox ? `${iconSlot} ${largeIconSlot}` : iconSlot;
  const iconBox = (icon: ReactNode) =>
    icon === undefined ? null : (
      <span className={iconClasses} aria-hidden="true">
        {icon}
      </span>
    );

  return (
    <button
      ref={props.ref}
      type={props.type ?? "button"}
      className={classes.trim()}
      aria-label={props.label}
      aria-busy={busy || undefined}
      aria-disabled={unavailable === undefined ? undefined : true}
      aria-describedby={unavailable?.reason}
      tabIndex={props.tabIndex}
      onClick={handleClick}
      onFocus={props.onFocus}
    >
      {props.busyLabel === undefined ? (
        <>
          {iconBox(busy ? <Spinner /> : props.icon)}
          {props.children}
        </>
      ) : (
        // Both copies always take up room; the one not in use is `invisible`, so it only sets the
        // width and screen readers skip it.
        <span className={busyCell}>
          <span className={`${busyCopy} ${busy ? "invisible" : ""}`.trim()}>
            {iconBox(props.icon)}
            {props.children}
          </span>
          <span className={`${busyCopy} ${busy ? "" : "invisible"}`.trim()}>
            {iconBox(<Spinner />)}
            {props.busyLabel}
          </span>
        </span>
      )}
    </button>
  );
}

function buttonSizeClasses(size: ButtonSize, isIconButton: boolean, inFieldBox: boolean): string {
  if (inFieldBox) {
    return inFieldBoxIconButton;
  }
  return isIconButton ? iconButtonClasses[size] : sizeClasses[size];
}
