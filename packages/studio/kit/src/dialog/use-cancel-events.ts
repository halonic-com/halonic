import { type MouseEvent, type PointerEvent, type SyntheticEvent, useRef } from "react";

/**
 * The `<dialog>`'s own events, all of which cancel through `cancel` (which does nothing while
 * busy). Escape is Cancel: whatever Cancel puts back, Escape puts back too. The Dialog never
 * closes itself, the screen unmounts it, so Escape's own close is always stopped. A click on the
 * overlay cancels only when the press started there too, and, with `keepTyping`, only before
 * anything was typed, so a stray click doesn't throw away what the form holds. A footerless Dialog
 * saves as it goes, so it has nothing to lose and passes `false`.
 */
export function useCancelEvents(cancel: () => void, onCancel: () => void, keepTyping: boolean) {
  const typed = useRef(false);
  const pressedOverlay = useRef(false);
  return {
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      cancel();
    },
    onClose: (event: SyntheticEvent<HTMLDialogElement>) => closedByBrowser(event, onCancel),
    onInput: () => {
      typed.current = true;
    },
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => {
      pressedOverlay.current = event.target === event.currentTarget;
    },
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      if (
        event.target === event.currentTarget &&
        pressedOverlay.current &&
        !(keepTyping && typed.current)
      ) {
        cancel();
      }
    },
  };
}

/**
 * The Dialog only closes by unmounting, so a `close` event while it's still open in React means
 * the browser closed it anyway (Chrome lets a second Escape through). A `close` that a remount
 * already reopened (React's strict mode) is ignored.
 */
function closedByBrowser(event: SyntheticEvent<HTMLDialogElement>, onCancel: () => void) {
  if (!event.currentTarget.open) {
    onCancel();
  }
}
