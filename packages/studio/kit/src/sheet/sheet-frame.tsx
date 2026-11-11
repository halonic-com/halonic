import { type FormEvent, type ReactNode, type RefObject, useId, useRef } from "react";
import { Button, type ButtonUnavailable } from "../button/button.tsx";
import { ModalRegions } from "../dialog/modal-regions.tsx";
import { useCancelEvents } from "../dialog/use-cancel-events.ts";
import { useModal } from "../dialog/use-modal.ts";
import { CloseIcon } from "../icons/close-icon.tsx";

/**
 * A sheet fills the screen: a `surface` fill with no radius, shadow or visible overlay, as high
 * as the shell's column (`--app-height`, so it gets shorter when the keyboard opens), and the
 * Dialog's 200ms fade. It's a flex column only while open, so a closed `<dialog>` stays hidden.
 */
export const sheetFrameClasses = [
  "m-0 h-(--app-height,100dvh) max-h-none w-full max-w-none flex-col overflow-hidden",
  "rounded-none border-0 bg-surface p-0 text-fg open:flex",
  "transition-opacity duration-(--duration-base) ease-(--ease-enter) starting:opacity-0",
  "backdrop:bg-transparent",
].join(" ");

export interface SheetFrameProps {
  /** The sheet's title: the field's label ("Model", "Instructions") or the form's name. */
  readonly title: string;
  /**
   * Close at the top left, for a sheet you can cancel: a form or a picker. Close cancels and
   * throws away what changed. Without it, the title starts 16px in (the text sheet).
   */
  readonly onClose?: () => void;
  /** Close can't be pressed now: while a form sheet is busy, with the busy button as the reason. */
  readonly closeUnavailable?: ButtonUnavailable | undefined;
  /** Escape and Android back, which the shell turns into the dialog's `cancel`. */
  readonly onCancel: () => void;
  /**
   * The browser closed the dialog although `onCancel` refused (Chrome lets a second Escape
   * through). Default: `onCancel`.
   */
  readonly onClosedByBrowser?: () => void;
  /**
   * Makes the sheet one form, round the body and the footer: its submit button, or Enter in a
   * one-line field, submits it.
   */
  readonly onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** The last row, under the scrolling body: a form sheet's ActionBar. */
  readonly footer?: ReactNode;
  /** The top bar's right slot: the text sheet's Done. */
  readonly actions?: ReactNode;
  /** Where focus goes when the sheet opens. Default: its title. */
  readonly initialFocus?: () => HTMLElement | null;
  /** Where focus goes on close when the opener has gone (component specs 23 A2). */
  readonly returnFocus?: () => HTMLElement | null;
  /** The body, which scrolls on its own. The sheet gives it its padding. */
  readonly children: ReactNode;
}

/**
 * The frame of the form, text and picker sheets (component specs 15.3): a `<dialog>` opened with
 * `showModal()`, so focus, inertness, Escape and the live regions are the Dialog's, with the
 * phone top bar as its header. Mounting it opens it; the screen unmounts it to close it, and
 * focus goes back to the opener.
 */
export function SheetFrame(props: SheetFrameProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useModal(dialog, {
    initial: () => props.initialFocus?.() ?? title.current,
    fallback: props.returnFocus,
  });
  const events = useCancelEvents(props.onCancel, props.onClosedByBrowser ?? props.onCancel);
  const content = (
    <>
      <SheetBar
        titleId={titleId}
        title={title}
        text={props.title}
        onClose={props.onClose}
        closeUnavailable={props.closeUnavailable}
        actions={props.actions}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
      {props.footer}
    </>
  );
  return (
    <dialog ref={dialog} aria-labelledby={titleId} className={sheetFrameClasses} {...events}>
      <ModalRegions>
        {props.onSubmit === undefined ? (
          content
        ) : (
          <form className="contents" noValidate onSubmit={props.onSubmit}>
            {content}
          </form>
        )}
      </ModalRegions>
    </dialog>
  );
}

interface SheetBarProps {
  readonly titleId: string;
  readonly title: RefObject<HTMLHeadingElement | null>;
  readonly text: string;
  readonly onClose: (() => void) | undefined;
  readonly closeUnavailable: ButtonUnavailable | undefined;
  readonly actions: ReactNode;
}

/**
 * The phone top bar (component specs 15.1) as the sheet's header: at least 56px plus the top
 * safe area, a `border` line below, padding 0 4px. Close at the left as a 48px icon button, the
 * title on one line, and the actions slot at the right with 12px more on its right, so a text
 * button there keeps the page's 16px inset.
 */
function SheetBar({ titleId, title, text, onClose, closeUnavailable, actions }: SheetBarProps) {
  return (
    <header className="flex phone-top-bar shrink-0 items-center gap-1 border-b border-border px-1">
      {onClose === undefined ? null : (
        <Button
          variant="ghost"
          size="lg"
          icon={<CloseIcon />}
          label="Close"
          unavailable={closeUnavailable}
          onClick={onClose}
        />
      )}
      <h2
        ref={title}
        id={titleId}
        tabIndex={-1}
        className={`min-w-0 flex-1 truncate text-heading outline-none${onClose === undefined ? " pl-3" : ""}`}
      >
        {text}
      </h2>
      {actions === undefined ? null : <div className="flex shrink-0 gap-1 pr-3">{actions}</div>}
    </header>
  );
}
