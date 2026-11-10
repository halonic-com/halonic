import type { RefObject } from "react";
import { Button } from "../button/button.tsx";
import { CloseIcon } from "../icons/close-icon.tsx";
import type { DialogProps } from "./dialog-props.ts";

export interface DialogHeaderProps {
  readonly props: DialogProps;
  readonly titleId: string;
  readonly confirmId: string;
  /** No ✕ on a phone: Cancel is right there. */
  readonly closeButton: boolean;
  readonly onClose: () => void;
}

/** The title and the ✕, which is unavailable while busy, for the same reason as Cancel. */
export function DialogHeader({
  props,
  titleId,
  confirmId,
  closeButton,
  onClose,
}: DialogHeaderProps) {
  const { busy = false } = props;
  const showClose = closeButton && props.closeButton !== false;
  return (
    <header
      className={`flex items-start gap-2 px-6 pt-5 pb-1${props.flush ? " border-b border-border" : ""}`}
    >
      <h2 id={titleId} className="min-w-0 flex-1 text-heading wrap-break-word">
        {props.title}
      </h2>
      {showClose ? (
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          label={props.closeLabel ?? `Close ${props.title.replace(/\?$/, "")}`}
          unavailable={busy ? { reason: confirmId } : undefined}
          onClick={onClose}
        />
      ) : null}
    </header>
  );
}

export interface DialogFooterProps {
  readonly props: DialogProps;
  readonly phone: boolean;
  readonly confirmId: string;
  readonly cancelButton: RefObject<HTMLButtonElement | null>;
  /** Missing in a form: the confirming button submits it instead. */
  readonly onConfirm: (() => void) | undefined;
  readonly onCancel: () => void;
}

/**
 * Cancel then the confirming button, right-aligned. On a phone they're stacked, full width and
 * 48px, with the confirming one first in the DOM, so focus moves in the order you see.
 */
export function DialogFooter({
  props,
  phone,
  confirmId,
  cancelButton,
  onConfirm,
  onCancel,
}: DialogFooterProps) {
  const { busy = false } = props;
  const size = phone ? "touch" : "md";
  const confirmButton = (
    <Button
      id={confirmId}
      variant={props.confirm.variant ?? "primary"}
      size={size}
      block={phone}
      type={onConfirm === undefined ? "submit" : "button"}
      busy={busy}
      busyLabel={props.confirm.busyLabel}
      unavailable={props.confirm.unavailable}
      onClick={onConfirm}
    >
      {props.confirm.label}
    </Button>
  );
  // While busy, Cancel is unavailable, and the busy confirming button ("Deleting…") says why.
  const cancelButtonElement = (
    <Button
      ref={cancelButton}
      variant="ghost"
      size={size}
      block={phone}
      unavailable={busy ? { reason: confirmId } : undefined}
      onClick={onCancel}
    >
      {props.cancelLabel ?? "Cancel"}
    </Button>
  );
  return (
    <footer
      className={
        phone ? "flex flex-col gap-2 px-6 pt-3 pb-4" : "flex justify-end gap-2 px-6 pt-3 pb-4"
      }
    >
      {phone ? confirmButton : cancelButtonElement}
      {phone ? cancelButtonElement : confirmButton}
    </footer>
  );
}
