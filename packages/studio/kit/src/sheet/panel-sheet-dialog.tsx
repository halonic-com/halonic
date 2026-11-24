import { type ReactNode, useId, useRef } from "react";
import { ModalRegions } from "../dialog/modal-regions.tsx";
import { useCancelEvents } from "../dialog/use-cancel-events.ts";
import { useModal } from "../dialog/use-modal.ts";
import { SidePanel } from "../side-panel/side-panel.tsx";
import { sheetFrameClasses } from "./sheet-frame.tsx";

/** Props of the kit's `PanelSheetDialog`. */
export interface PanelSheetDialogProps {
  /** The title in the sheet's top bar, which names the dialog: "What changes". */
  readonly title: string;
  /** The body, which scrolls on its own, with the panel's padding. */
  readonly children: ReactNode;
  /** The bottom bar: full-width buttons, each on its own row unless two fit side by side. */
  readonly footer?: ReactNode;
  /** Back, and Escape. */
  readonly onClose: () => void;
  /**
   * Where focus goes on close when the opener has gone, such as a card's state line after the
   * sheet's own button decided the card (component specs 23 A2).
   */
  readonly returnFocus?: (() => HTMLElement | null) | undefined;
}

/**
 * A panel sheet (component specs 15.3) opened from a part of a page rather than as a page of its
 * own, such as a change card in the Assistant's chat: the `SidePanel` with Back over the whole
 * screen, in a `<dialog>` opened with `showModal()`, so nothing behind it can take focus (WCAG
 * 2.4.11). The title names the dialog and the panel draws no region of its own, so a screen
 * reader hears it once. Escape is Back. Mounting it opens it; the screen unmounts it to close it,
 * and focus goes back to the opener, else to `returnFocus()`.
 *
 * @example
 * {open ? <PanelSheetDialog title="What changes" footer={buttons} onClose={close}>{diff}</PanelSheetDialog> : null}
 */
export function PanelSheetDialog(props: PanelSheetDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  // The panel focuses its title before the dialog opens, so the dialog focuses it again.
  useModal(dialog, {
    initial: () => dialog.current?.querySelector<HTMLElement>("h2") ?? null,
    fallback: props.returnFocus,
  });
  const events = useCancelEvents(props.onClose, props.onClose, false);
  return (
    <dialog ref={dialog} aria-labelledby={titleId} className={sheetFrameClasses} {...events}>
      <ModalRegions>
        <SidePanel
          title={props.title}
          dialogTitleId={titleId}
          footer={props.footer}
          onClose={props.onClose}
        >
          {props.children}
        </SidePanel>
      </ModalRegions>
    </dialog>
  );
}
