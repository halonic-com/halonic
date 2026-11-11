import type { ReactNode } from "react";
import type { ButtonUnavailable } from "../button/button.tsx";

/** `sm` 440px: confirmations, short forms. `md` 560px: a form with hints. `lg` 720px: Settings. */
export type DialogSize = "sm" | "md" | "lg";

/** The confirming button, last in the footer on desktop and first on a phone. */
export interface DialogConfirm {
  /** Names the action: "Delete agent", never "OK". */
  readonly label: string;
  /** `danger` when it deletes or removes something. Default `primary`. */
  readonly variant?: "primary" | "danger";
  /**
   * The label while `busy`: "Deleting…". Required, because it's also why Cancel and the ✕ are
   * unavailable then.
   */
  readonly busyLabel: string;
  /** Only for a reason that isn't an incomplete form: that one stays pressable (23 A1). */
  readonly unavailable?: ButtonUnavailable;
}

/** What every Dialog takes, with a footer or without one. */
interface DialogCommonProps {
  /** "Delete agent?", "New agent". The dialog's name. */
  readonly title: string;
  readonly size?: DialogSize;
  /** A fixed height in px instead of one that follows the content (Settings: 640). Not on a phone. */
  readonly height?: number;
  /** No body padding, for a body that lays out and scrolls its own columns (Settings). */
  readonly flush?: boolean;
  /**
   * Cancel, the ✕, Escape and a click on the overlay. The screen unmounts the Dialog. The
   * browser can force a close while `busy`; this still runs then, and the request's result goes
   * to a toast.
   */
  readonly onCancel: () => void;
  /**
   * The ✕'s name. Default "Close" and the title without a trailing "?". A title that starts
   * with "Close" passes one: "Keep Acme open".
   */
  readonly closeLabel?: string;
  /** A failed request's message, read through the alert slot at the end of the body. */
  readonly error?: string;
  /** Where focus goes on close when the opener has gone, such as a deleted row's next row (23 A2). */
  readonly returnFocus?: () => HTMLElement | null;
  readonly children: ReactNode;
}

/** A decision or a form: Cancel and the confirming button in a footer. */
export interface ConfirmingDialogProps extends DialogCommonProps {
  /**
   * The body is a form: the Dialog wraps it in a `<form>`, the confirming button submits it (so
   * Enter in a one-line field does too), and focus starts in the first field.
   */
  readonly form?: boolean;
  readonly confirm: DialogConfirm;
  /** Runs on the confirming button or a submit. The screen checks its fields first (23 A1). */
  readonly onConfirm: () => void;
  /** "Cancel", or what cancelling does: "Not now". */
  readonly cancelLabel?: string;
  /** Default `true`. `false` for a decision whose cancel button says what it does. */
  readonly closeButton?: boolean;
  /** While the request runs: the confirming button is busy, Escape and the overlay do nothing. */
  readonly busy?: boolean;
  readonly initialFocus?: undefined;
}

/**
 * A place where every change saves by itself, such as Settings (HAL-1102): no footer, so
 * nothing to confirm, and the ✕ is always there, on a phone too, as the one way out besides
 * Escape.
 */
export interface FooterlessDialogProps extends DialogCommonProps {
  readonly form?: undefined;
  readonly confirm?: undefined;
  readonly onConfirm?: undefined;
  readonly cancelLabel?: undefined;
  readonly closeButton?: undefined;
  readonly busy?: undefined;
  /** Where focus starts: Settings' current section row. Default the first field, else the ✕. */
  readonly initialFocus?: () => HTMLElement | null;
}

/** The props of `Dialog`: with a confirming button, or without a footer at all. */
export type DialogProps = ConfirmingDialogProps | FooterlessDialogProps;
