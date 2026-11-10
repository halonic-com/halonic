import { type ReactNode, useRef } from "react";
import { ModalRegions } from "./modal-regions.tsx";
import { useCancelEvents } from "./use-cancel-events.ts";
import { useModal } from "./use-modal.ts";

/** The props of `PaletteBox`. */
export interface PaletteBoxProps {
  /** The dialog's name, "Search" for Ctrl K. No title shows: the search row is the top. */
  readonly label: string;
  /** Where focus goes once it's open: the search box, because the palette was opened to type. */
  readonly initialFocus: () => HTMLElement | null;
  /** Escape and a click on the overlay. The screen unmounts the box. */
  readonly onCancel: () => void;
  /** The search row, the results and the footer; the results scroll, the rest stays put. */
  readonly children: ReactNode;
}

/**
 * The box sits 96px from the top over the overlay and fades in, like a Dialog's. It's a flex
 * column only while open, so a closed `<dialog>` stays hidden.
 */
const frame = [
  "palette-frame w-palette flex-col overflow-hidden rounded-lg border border-transparent p-0",
  "bg-surface-raised text-fg shadow-3 open:flex",
  "transition-opacity duration-(--duration-base) ease-(--ease-enter) starting:opacity-0",
  "backdrop:bg-overlay backdrop:transition-opacity backdrop:duration-(--duration-base)",
  "backdrop:ease-(--ease-enter) backdrop:starting:opacity-0",
].join(" ");

/**
 * The Ctrl K palette's box (component specs 24.3): a modal `<dialog>` with no header or footer of
 * its own, 600px wide and 96px from the top, growing with its content until 96px above the
 * window's bottom. It works as a Dialog does: mounting it opens it, the screen unmounts it to
 * close it, Escape and a click on the overlay cancel (the overlay even after typing), focus goes
 * back to the opener, and the
 * shell's announcements are read from its own live regions while it's open.
 *
 * @example
 * {searching ? (
 *   <PaletteBox label="Search" initialFocus={() => box.current} onCancel={close}>
 *     <SearchRow ref={box} … />
 *     <Results … />
 *   </PaletteBox>
 * ) : null}
 */
export function PaletteBox({ label, initialFocus, onCancel, children }: PaletteBoxProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useModal(dialog, { initial: initialFocus });
  // No `onInput`: a Dialog's overlay stops cancelling once something is typed, to keep a form's
  // work, but typing is all a palette is for and its words are no work to lose.
  const { onInput: _typed, ...cancelEvents } = useCancelEvents(onCancel, onCancel);

  return (
    <dialog ref={dialog} aria-label={label} className={frame} {...cancelEvents}>
      <ModalRegions>{children}</ModalRegions>
    </dialog>
  );
}
