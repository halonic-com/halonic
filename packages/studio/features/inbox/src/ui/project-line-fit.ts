import { type RefObject, useLayoutEffect, useState } from "react";

/** The widths, in pixels, that decide how many project chips fit on the filter's one line. */
export interface LineWidths {
  /** The line's own width; 0 while it isn't laid out. */
  readonly room: number;
  /** The "All" chip, which always shows. */
  readonly first: number;
  /** The project chips after it, in their order. */
  readonly chips: readonly number[];
  /** The "+N" button, shown while any chip doesn't fit. */
  readonly more: number;
  readonly gap: number;
}

/**
 * How many of the chips after "All" fit on the line (`inbox.project-line`), in their order, with
 * room kept for "+N" while any are left over. A line that isn't laid out yet (no room) fits them
 * all, so nothing hides before it can be measured.
 */
export function chipsThatFit({ room, first, chips, more, gap }: LineWidths): number {
  if (room <= 0) return chips.length;
  let used = first;
  for (const [index, width] of chips.entries()) {
    const leftOver = chips.length - index - 1;
    const needed = used + gap + width + (leftOver > 0 ? gap + more : 0);
    if (needed > room) return index;
    used += gap + width;
  }
  return chips.length;
}

/**
 * Measures the line and a hidden copy of its chips (`sample`: "All", each project chip, then a
 * "+N"), again whenever the line changes size or `shape` changes, and says how many chips fit.
 */
export function useChipsThatFit(
  line: RefObject<HTMLElement | null>,
  sample: RefObject<HTMLElement | null>,
  shape: string,
): number {
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY);
  // `shape` is a dependency because new chips have new widths.
  useLayoutEffect(() => {
    const row = line.current;
    const copy = sample.current;
    if (row === null || copy === null) return;
    const measure = () => {
      const widths = [...copy.children].map((chip) =>
        chip instanceof HTMLElement ? chip.offsetWidth : 0,
      );
      const more = widths.pop() ?? 0;
      const [first = 0, ...chips] = widths;
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      setFit(chipsThatFit({ room: row.clientWidth, first, chips, more, gap }));
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(row);
    return () => observer?.disconnect();
  }, [line, sample, shape]);
  return fit;
}
