import { type RefObject, useEffect, useRef } from "react";
import { placePopover } from "../popover/place-popover.ts";

/** The popover opens 4px below the field (decision P-D1). */
const FIELD_GAP = 4;

/**
 * What the popover lines up with: the box the opener sits in (an Input's box, for its leading
 * button), so its left edge is on the box's, not on the button's.
 */
function anchorOf(opener: HTMLElement): Element {
  return opener.parentElement ?? opener;
}

/**
 * Shows and hides a `popover="manual"` element as `open` says, places it under its opener's box,
 * and keeps it there while the window changes size or something scrolls. While it's open, a
 * press outside it and outside the opener calls `onClose`. It gives back whether a press on the
 * opener is under way, so focus moving to the opener closes the popover only from the keyboard.
 *
 * Manual rather than `auto`: the browser's light dismiss would close it on the press that starts
 * a click on the opener, and the click would open it again. Here the opener's own click decides.
 */
export function useAnchoredPopover(
  popover: RefObject<HTMLElement | null>,
  opener: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): RefObject<boolean> {
  const shown = useRef(false);
  const pressingOpener = useRef(false);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    const element = popover.current;
    const button = opener.current;
    if (element === null) {
      return;
    }
    if (!open || button === null) {
      if (shown.current) {
        element.hidePopover();
        shown.current = false;
      }
      return;
    }
    if (!shown.current) {
      element.showPopover();
      shown.current = true;
    }
    const place = () => placePopover(element, anchorOf(button), { gap: FIELD_GAP, align: "start" });
    place();
    const press = (event: PointerEvent) => {
      const target = event.target as Node;
      pressingOpener.current = button.contains(target);
      if (!element.contains(target) && !pressingOpener.current) {
        latestClose.current();
      }
    };
    // Not on `pointerup`: on a touch tap it comes before the compatibility `mousedown` that moves
    // focus. A key press clears it too, so a press dragged off the opener doesn't let a later
    // Shift+Tab onto it through.
    const release = () => {
      pressingOpener.current = false;
    };
    document.addEventListener("pointerdown", press, true);
    document.addEventListener("click", release, true);
    document.addEventListener("pointercancel", release, true);
    document.addEventListener("keydown", release, true);
    addEventListener("resize", place);
    addEventListener("scroll", place, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", press, true);
      document.removeEventListener("click", release, true);
      document.removeEventListener("pointercancel", release, true);
      document.removeEventListener("keydown", release, true);
      pressingOpener.current = false;
      removeEventListener("resize", place);
      removeEventListener("scroll", place, { capture: true });
    };
  }, [open, popover, opener]);
  return pressingOpener;
}
