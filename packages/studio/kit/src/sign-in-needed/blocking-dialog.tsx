import { type ReactNode, type SyntheticEvent, useId, useRef } from "react";
import { ModalRegions } from "../dialog/modal-regions.tsx";
import { useModal } from "../dialog/use-modal.ts";

/** The props of `BlockingDialog`. */
export interface BlockingDialogProps {
  /** The dialog's heading, which also names it. */
  readonly title: string;
  /** One line under the title, which also describes the dialog. */
  readonly description: string;
  /** Where focus goes once it's open, such as the first Sign in button; else the title. */
  readonly initialFocus?: () => HTMLElement | null;
  readonly children: ReactNode;
}

/** The Dialog's box, without the ✕: nothing in it closes it. */
const frame = [
  "dialog-frame w-dialog-sm m-auto flex-col overflow-hidden rounded-lg border border-transparent p-0",
  "bg-surface-raised text-fg shadow-3 open:flex",
  "transition-opacity duration-(--duration-base) ease-(--ease-enter) starting:opacity-0",
  "backdrop:bg-overlay backdrop:transition-opacity backdrop:duration-(--duration-base)",
  "backdrop:ease-(--ease-enter) backdrop:starting:opacity-0",
].join(" ");

/**
 * A modal the user can't close, for an app that can't work until something is done, such as a
 * sign-in (`kit.blocking-dialog`). Mounting it opens it and the screen unmounts it once the thing
 * is done. Escape, a click outside and the browser's own close requests don't close it, it has no
 * ✕, and focus stays inside it. Use the kit's `Dialog` for anything the user may cancel.
 *
 * @example
 * {signInNeeded ? (
 *   <BlockingDialog title="Sign in to Paperclip" description="Inbox needs your Paperclip sign-in to work.">
 *     <SignInRow … />
 *   </BlockingDialog>
 * ) : null}
 */
export function BlockingDialog({
  title,
  description,
  initialFocus,
  children,
}: BlockingDialogProps) {
  const ids = { title: useId(), description: useId() };
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useModal(dialog, { initial: () => initialFocus?.() ?? heading.current });

  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby={ids.title}
      aria-describedby={ids.description}
      className={frame}
      onCancel={keepOpen}
      onClose={reopen}
    >
      <ModalRegions>
        <div className="flex flex-col gap-1 px-6 pt-5 pb-2">
          <h2 ref={heading} id={ids.title} tabIndex={-1} className="text-heading wrap-break-word">
            {title}
          </h2>
          <p id={ids.description} className="text-body text-fg-muted wrap-break-word">
            {description}
          </p>
        </div>
        <div className="flex flex-col gap-3 px-6 pt-2 pb-6">{children}</div>
      </ModalRegions>
    </dialog>
  );
}

/** Escape fires `cancel`; preventing it keeps the dialog open. */
function keepOpen(event: SyntheticEvent<HTMLDialogElement>): void {
  event.preventDefault();
}

/**
 * Some browsers close a modal on a second Escape even when its `cancel` was prevented; while the
 * component is mounted, it opens again.
 */
function reopen(event: SyntheticEvent<HTMLDialogElement>): void {
  const element = event.currentTarget;
  if (element.isConnected && !element.open) {
    element.showModal();
  }
}
