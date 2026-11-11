import { type RefObject, useLayoutEffect, useState } from "react";

/**
 * The width `element` is drawn at, followed as it changes: the window resizing, the sidebar's edge
 * moving. `undefined` before it was measured, and where the browser has no `ResizeObserver`.
 */
export function useElementWidth(element: RefObject<HTMLElement | null>): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const target = element.current;
    if (target === null || typeof ResizeObserver === "undefined") {
      return;
    }
    // Measured before the browser paints, so a narrow tab never shows the wide layout for a frame
    // while it waits for the observer's first report.
    setWidth(target.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return width;
}
