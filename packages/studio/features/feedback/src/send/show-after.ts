import { useEffect, useState } from "react";

/** Nothing shows for a wait shorter than this, so a quick one doesn't flash (the loading rule). */
export const showAfterMs = 300;

/** One breath of a skeleton: three take 4.8 s, under the 5 s rule. */
const breathMs = 1600;

/**
 * Whether `active` has held for `showAfterMs`: a wait's sign (a skeleton, a spinner) shows only
 * then, and goes as soon as `active` ends.
 */
export function useShownAfterWait(active: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    if (!active) return;
    const timer = setTimeout(() => setShown(true), showAfterMs);
    return () => clearTimeout(timer);
  }, [active]);
  return active && shown;
}

/**
 * A skeleton breathes, opacity 1 → 0.55 → 1, three times, then rests, as Messenger's does. Under
 * reduced motion it stays still, and so it does in jsdom, which has no `element.animate`.
 */
export function breathe(element: HTMLElement | null): void {
  if (element === null || typeof element.animate !== "function") return;
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) return;
  element
    .animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
      duration: breathMs,
      easing: "ease-in-out",
      iterations: 3,
    })
    .finished.catch((error: unknown) => {
      // A breath cut short because the crop arrived did nothing wrong.
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("The crop's skeleton didn't breathe:", error);
    });
}
