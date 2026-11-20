import { type RefObject, useLayoutEffect, useState } from "react";

/** The region's gap from the edge it sits on: `phone:bottom-2` at the bottom, the same at the top. */
const GAP_PX = 8;

/** Where the region sits at the top: `y` in the window, `top` in its containing block. */
interface TopPlace {
  readonly y: number;
  readonly top: number;
}

/**
 * On a phone a toast spans the window's width, so at 400 % zoom the drawn toast can cover the
 * element that has focus, often the button that made it (WCAG 2.4.11, HAL-14028). When it would,
 * the region sits at the top of the window for that toast, 8px under the bars above the page (or
 * under the window's top edge once a short window has scrolled them away), as long as the focused
 * element is clear there. It stays there until that toast closes; the next one starts at the
 * bottom again. What a toast says and how long it stays don't change.
 *
 * `drawn` is the id of the drawn toast, or `undefined` where nothing moves (desktop, none drawn).
 * Returns the region's `top` in px, or `null` while it stays at the bottom.
 *
 * @example
 * const top = useToastClearOfFocus(box, phone ? drawnId : undefined);
 * <section ref={box} style={top === null ? undefined : { top, bottom: "auto" }}>…</section>
 */
export function useToastClearOfFocus(
  box: RefObject<HTMLElement | null>,
  drawn: string | undefined,
): number | null {
  const [placed, setPlaced] = useState<{ readonly id: string; readonly top: number } | null>(null);
  const atTop = drawn !== undefined && placed?.id === drawn;

  // Measured before the toast is painted, and again whenever focus moves while it shows at the
  // bottom: a menu hands focus back to its ⋮ after its item has made the toast.
  useLayoutEffect(() => {
    const region = box.current;
    if (drawn === undefined || region === null || atTop) {
      return;
    }
    const check = () => {
      const place = placeClearOfFocus(region);
      if (place !== null) {
        setPlaced({ id: drawn, top: place.top });
      }
    };
    check();
    document.addEventListener("focusin", check);
    return () => document.removeEventListener("focusin", check);
  }, [box, drawn, atTop]);

  // On a short window the bars scroll with the page; the toast follows them while they show.
  useLayoutEffect(() => {
    const region = box.current;
    if (drawn === undefined || region === null || !atTop) {
      return;
    }
    const follow = () => {
      const { top } = topPlace(region);
      setPlaced((before) => (before?.top === top ? before : { id: drawn, top }));
    };
    document.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
    };
  }, [box, drawn, atTop]);

  return atTop ? (placed?.top ?? null) : null;
}

/**
 * The place at the top, if the drawn toast covers the focused element where it is and wouldn't
 * there; `null` if it doesn't cover it, or would cover it at the top as well.
 */
function placeClearOfFocus(region: HTMLElement): TopPlace | null {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || focused === document.body || region.contains(focused)) {
    return null;
  }
  const cards = region.querySelectorAll<HTMLElement>("[data-toast]:not(.sr-only)");
  const card = cards[cards.length - 1];
  if (card === undefined) {
    return null;
  }
  const target = focused.getBoundingClientRect();
  const atBottom = card.getBoundingClientRect();
  if (!overlaps(atBottom, target)) {
    return null;
  }
  const place = topPlace(region);
  const atTop = DOMRect.fromRect({
    x: atBottom.x,
    y: place.y,
    width: atBottom.width,
    height: atBottom.height,
  });
  return overlaps(atTop, target) ? null : place;
}

/**
 * 8px under the top of the region's wrapper, which starts under the top bar, or 8px under the
 * window's top once a short window has scrolled the bars away. There the region is `fixed`, so
 * its `top` is in the window; otherwise it's `absolute` in the wrapper.
 */
function topPlace(region: HTMLElement): TopPlace {
  const wrapper = region.parentElement?.getBoundingClientRect().top ?? 0;
  const y = Math.max(wrapper, 0) + GAP_PX;
  const fixed = getComputedStyle(region).position === "fixed";
  return { y, top: fixed ? y : y - wrapper };
}

/** Whether two boxes share any area; boxes that only touch don't. */
function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
