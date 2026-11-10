import { type CSSProperties, type FormEvent, useId, useRef, useState } from "react";
import { usePresentation } from "../presentation/presentation.tsx";
import { AlertSlot } from "./alert-slot.tsx";
import { DialogFooter, DialogHeader } from "./dialog-parts.tsx";
import type { DialogProps, DialogSize } from "./dialog-props.ts";
import { ModalRegions } from "./modal-regions.tsx";
import { useCancelEvents } from "./use-cancel-events.ts";
import { useModal } from "./use-modal.ts";

const sizeClasses: Record<DialogSize, string> = {
  sm: "w-dialog-sm",
  md: "w-dialog-md",
  lg: "w-dialog-lg",
};

/**
 * The box sits over the overlay and fades in. It's a flex column only while open, so a closed
 * `<dialog>` stays hidden.
 */
const frame = [
  "dialog-frame m-auto flex-col overflow-hidden rounded-lg border border-transparent p-0",
  "bg-surface-raised text-fg shadow-3 open:flex",
  "transition-opacity duration-(--duration-base) ease-(--ease-enter) starting:opacity-0",
  "backdrop:bg-overlay backdrop:transition-opacity backdrop:duration-(--duration-base)",
  "backdrop:ease-(--ease-enter) backdrop:starting:opacity-0",
].join(" ");

/**
 * The header and the body scroll together when the window is short, so only the footer stays
 * put (component specs 8, "Short of room").
 */
const scroller = "flex min-h-0 flex-1 flex-col short:overflow-y-auto";
const bodyScroll = "min-h-0 flex-1 overflow-y-auto short:flex-none short:overflow-visible";

/**
 * A decision or a short form that must be finished or cancelled: the kit's `<dialog>` with
 * `showModal()`. Mounting it opens it, and the screen unmounts it to close it. Focus starts on
 * the first field of a form, or on Cancel in a confirmation, and goes back to the opener.
 *
 * The confirming button stays pressable while the form is incomplete: the screen shows every
 * field error and focuses the first. A failed request keeps the Dialog open with `error`.
 *
 * @example
 * {deleting ? (
 *   <Dialog title="Delete agent?" confirm={{ label: "Delete agent", variant: "danger",
 *     busyLabel: "Deleting…" }} busy={busy} error={error} onConfirm={remove}
 *     onCancel={() => setDeleting(false)} returnFocus={nextRow}>
 *     Sorter and its history are deleted from this workspace.
 *   </Dialog>
 * ) : null}
 */
export function Dialog(props: DialogProps) {
  const { size = "sm", flush = false, form = false, busy = false } = props;
  const phone = usePresentation() === "phone";
  const ids = { title: useId(), body: useId(), confirm: useId() };
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [attempt, setAttempt] = useState(0);

  useModal(dialog, {
    initial: () => (form ? firstField(body.current) : null) ?? cancelButton.current,
    fallback: props.returnFocus,
  });

  function cancel() {
    if (!busy) {
      props.onCancel();
    }
  }

  function confirm() {
    if (busy || props.confirm.unavailable !== undefined) {
      return;
    }
    setAttempt((previous) => previous + 1);
    props.onConfirm();
  }

  const events = useCancelEvents(cancel, props.onCancel);

  const footer = (
    <DialogFooter
      props={props}
      phone={phone}
      confirmId={ids.confirm}
      cancelButton={cancelButton}
      onConfirm={form ? undefined : confirm}
      onCancel={cancel}
    />
  );

  const content = (
    <>
      <div className={scroller}>
        <DialogHeader
          props={props}
          titleId={ids.title}
          confirmId={ids.confirm}
          closeButton={!phone}
          onClose={cancel}
        />
        <div ref={body} id={ids.body} className={`${bodyScroll} ${bodyClasses(flush, form)}`}>
          {props.children}
          <AlertSlot error={props.error} attempt={attempt} waiting={busy} />
        </div>
      </div>
      {footer}
    </>
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby={ids.title}
      aria-describedby={form || flush ? undefined : ids.body}
      className={`${frame} ${sizeClasses[size]}${props.height === undefined || phone ? "" : " dialog-height"}`}
      style={heightStyle(props.height, phone)}
      {...events}
    >
      {form ? (
        <form className="contents" noValidate onSubmit={(event) => submit(event, confirm)}>
          {content}
        </form>
      ) : (
        content
      )}
      <ModalRegions />
    </dialog>
  );
}

/** Confirmation text is `fg-muted`; a form's fields bring their own colours. */
function bodyClasses(flush: boolean, form: boolean): string {
  if (flush) {
    return "";
  }
  return form ? "px-6 pt-1 pb-4" : "px-6 pt-1 pb-4 text-body text-fg-muted";
}

function heightStyle(height: number | undefined, phone: boolean): CSSProperties | undefined {
  if (height === undefined || phone) {
    return undefined;
  }
  return { "--dialog-height": `${height}px` } as CSSProperties;
}

/** The first field that can take focus: not disabled, and not inside something `hidden`. */
function firstField(body: HTMLElement | null): HTMLElement | null {
  const fields = body?.querySelectorAll<HTMLElement>(
    "input:not([type=hidden]):enabled, textarea:enabled, select:enabled",
  );
  return [...(fields ?? [])].find((field) => field.closest("[hidden]") === null) ?? null;
}

function submit(event: FormEvent<HTMLFormElement>, confirm: () => void) {
  event.preventDefault();
  confirm();
}
