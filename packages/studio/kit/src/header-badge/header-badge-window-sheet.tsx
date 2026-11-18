import { useLayoutEffect, useRef } from "react";
import { ModalRegions } from "../dialog/modal-regions.tsx";
import { modalOpened } from "../dialog/open-modals.ts";
import { useCancelEvents } from "../dialog/use-cancel-events.ts";
import { sheetFrameClasses } from "../sheet/sheet-frame.tsx";
import { HeaderBadgeSheet, type HeaderBadgeSheetProps } from "./header-badge-sheet.tsx";

/**
 * The {@link HeaderBadgeSheet} over a desktop window as narrow as a phone, which has no page stack
 * to put it on: More's workspace row and the sample chip open it. It's a `<dialog>` opened with
 * `showModal()`, so the page under it is inert, Tab and Shift+Tab stay in the sheet, and screen
 * readers hear only the sheet. Escape closes it as Back does. The served phone puts the plain
 * `HeaderBadgeSheet` on its page stack instead. Mounting it opens it; the screen unmounts it to
 * close it.
 *
 * Focus is the `SidePanel`'s: to the title on open, back to the row or chip that opened it on
 * close. The dialog only moves it to the title once more after it's open, since a browser won't
 * focus anything in a `<dialog>` that's still closed.
 *
 * @example
 * {open ? <HeaderBadgeWindowSheet title="Workspace" entries={entries} onClose={() => setOpen(false)} /> : null}
 */
export function HeaderBadgeWindowSheet(props: HeaderBadgeSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    element.showModal();
    const closed = modalOpened();
    element.querySelector<HTMLElement>("h2")?.focus();
    return () => {
      element.close();
      closed();
    };
  }, []);
  // Nothing in the sheet is typed, so nothing is lost to a stray click.
  const events = useCancelEvents(props.onClose, props.onClose, false);
  return (
    <dialog ref={dialog} aria-label={props.title} className={sheetFrameClasses} {...events}>
      <ModalRegions>
        <HeaderBadgeSheet {...props} />
      </ModalRegions>
    </dialog>
  );
}
