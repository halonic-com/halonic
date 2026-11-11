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
