import { useEffect, useState } from "react";

/**
 * Narrower than this (40rem at 16px), a panel with a list of pages beside the page leaves the page
 * too little room for a field, so the list goes across the top instead.
 */
export const NARROW_PANEL_PX = 640;

/**
 * Measures a panel: put `ref` on its element, and `narrow` says whether it is narrower than
 * {@link NARROW_PANEL_PX}, following every resize. `narrow` is `false` until the element is
 * measured, and where the browser can't measure (a test without a layout).
 */
export function useNarrowPanel(): {
  readonly ref: (element: HTMLElement | null) => void;
  readonly narrow: boolean;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setNarrow(entry.contentRect.width < NARROW_PANEL_PX);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, narrow };
}
