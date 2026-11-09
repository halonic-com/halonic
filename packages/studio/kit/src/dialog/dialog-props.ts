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
  /** The label while `busy`: "Deleting…". */
  readonly busyLabel?: string;
  /** Only for a reason that isn't an incomplete form: that one stays pressable (23 A1). */
  readonly unavailable?: ButtonUnavailable;
}

export interface DialogProps {
  /** "Delete agent?", "New agent". The dialog's name. */
  readonly title: string;
  readonly size?: DialogSize;
  /** A fixed height in px instead of one that follows the content (Settings: 640). Not on a phone. */
  readonly height?: number;
  /** No body padding, for a body that lays out and scrolls its own columns (Settings). */
  readonly flush?: boolean;
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
  /**
   * Cancel, the ✕, Escape and a click on the overlay. The screen unmounts the Dialog. The
   * browser can force a close while `busy`; this still runs then, and the request's result goes
   * to a toast.
   */
  readonly onCancel: () => void;
  /** Default `true`. `false` for a decision whose cancel button says what it does. */
  readonly closeButton?: boolean;
  /** The ✕'s name. Default "Close" and the title. */
  readonly closeLabel?: string;
  /** While the request runs: the confirming button is busy, Escape and the overlay do nothing. */
  readonly busy?: boolean;
  /** A failed request's message, read through the alert slot at the end of the body. */
  readonly error?: string;
  /** Where focus goes on close when the opener has gone, such as a deleted row's next row (23 A2). */
  readonly returnFocus?: () => HTMLElement | null;
  readonly children: ReactNode;
}
