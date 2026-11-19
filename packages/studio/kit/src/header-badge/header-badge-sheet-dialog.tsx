import { useRef } from "react";
import { ModalRegions } from "../dialog/modal-regions.tsx";
import { useCancelEvents } from "../dialog/use-cancel-events.ts";
import { useModal } from "../dialog/use-modal.ts";
import { sheetFrameClasses } from "../sheet/sheet-frame.tsx";
import { HeaderBadgeSheet, type HeaderBadgeSheetProps } from "./header-badge-sheet.tsx";

/**
 * A {@link HeaderBadgeSheet} over the whole window, for a screen that has no page stack to put it
 * on, such as More in a desktop window as narrow as a phone. It is a `<dialog>` opened with
 * `showModal()`, as the kit's other sheets are, so everything behind it is inert: Tab never
 * reaches a control hidden under the sheet (WCAG 2.4.11). Escape is Back. Mounting it opens it;
 * the screen unmounts it to close it, and focus goes back to the opener.
 *
 * @example
 * {open ? <HeaderBadgeSheetDialog title="Workspace" entries={entries} onClose={close} /> : null}
 */
export function HeaderBadgeSheetDialog(props: HeaderBadgeSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The panel focuses its title before the dialog opens, while the title can't take focus yet,
  // so the dialog focuses it again once it is open.
  useModal(dialog, { initial: () => dialog.current?.querySelector<HTMLElement>("h2") ?? null });
  // The sheet holds nothing typed, so Escape always closes it, as Back does.
  const events = useCancelEvents(props.onClose, props.onClose, false);
  return (
    <dialog ref={dialog} aria-label={props.title} className={sheetFrameClasses} {...events}>
      <ModalRegions>
        <HeaderBadgeSheet {...props} />
      </ModalRegions>
    </dialog>
  );
}
