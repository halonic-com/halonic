import { type RefObject, type SyntheticEvent, useLayoutEffect } from "react";

/**
 * Opens `dialog` as a modal while it is mounted, so it joins the browser's top layer above
 * everything, a modal the app already has open included: no z-index reaches above a modal
 * `<dialog>`, and the newest one is on top (the board, HAL-19757). Being modal also keeps the
 * pointer and the keys off the app's modal under it.
 */
export function useTopLayer(dialog: RefObject<HTMLDialogElement | null>): void {
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    element.showModal();
    return () => element.close();
  }, [dialog]);
}

/**
 * Keeps the browser from closing the dialog on Esc by itself: the overlay's own Esc handler takes
 * it away and ends the feedback.
 */
export function keepOpenOnCancel(event: SyntheticEvent<HTMLDialogElement>): void {
  event.preventDefault();
}
