import { type RefObject, useEffect, useLayoutEffect } from "react";

/**
 * The custom property a fill tab's `flex-basis` reads (`sizeClasses.fill`). Unset, the tabs wrap
 * as their words allow; set, each row takes the same number of tabs.
 */
const basisProperty = "--tab-basis";

/**
 * The track's `gap-0.5`. Each tab's basis leaves out one gap, so a full row's bases add up to less
 * than the track and never wrap on rounding; the tabs' `flex-1` shares out the rest.
 */
const gap = "calc(var(--spacing) * 0.5)";

/**
 * When the tabs of a fill tab list don't fit on one row, gives every row the same number of tabs,
 * as near as it can: four and one become three and two, so the last tab doesn't stretch alone
 * across a row of its own (HAL-14105). It counts the rows the tabs take as their words allow, then
 * caps each row at the tabs divided by the rows, rounded up, unless that takes more rows. It
 * measures again on each render, as a new counter or label changes the widths, and when the track
 * changes size.
 */
export function useBalancedRows(track: RefObject<HTMLElement | null>, active: boolean): void {
  // Before paint, so the unbalanced rows are never seen.
  useLayoutEffect(() => {
    const element = track.current;
    if (element !== null) {
      balance(element, active);
    }
  });

  // A new width, a larger text size or a list that mounted hidden and is now shown: measure again.
  // Balancing gives the same answer for the same width and words, so the size it sets settles.
  useEffect(() => {
    const element = track.current;
    if (!active || element === null || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => balance(element, true));
    observer.observe(element);
    return () => observer.disconnect();
  }, [track, active]);
}

/** Clears the basis, counts the rows the tabs then take and, if there's more than one, caps them. */
function balance(track: HTMLElement, active: boolean): void {
  track.style.removeProperty(basisProperty);
  if (!active) {
    return;
  }
  const rows = rowCount(track);
  if (rows === 1) {
    return;
  }
  const perRow = Math.ceil(track.children.length / rows);
  track.style.setProperty(basisProperty, `calc(100% / ${perRow} - ${gap})`);
  // A tab whose word is wider than its share takes more room, and can push the tabs after it on
  // to an extra row: at 195px "Behaviour" doesn't fit in half the track. Then the tabs keep the
  // rows their words allow.
  if (rowCount(track) > rows) {
    track.style.removeProperty(basisProperty);
  }
}

/** How many rows the track's tabs take: one for each height a tab starts at. */
function rowCount(track: HTMLElement): number {
  return new Set(Array.from(track.children, (child) => (child as HTMLElement).offsetTop)).size;
}
