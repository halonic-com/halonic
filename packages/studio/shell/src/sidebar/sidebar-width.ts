import { clampEdgeWidth, type EdgeLimits, edgeWidthForKey } from "../resize/edge-width.ts";

/**
 * The sidebar's width outside a window that follows its own width, such as the narrow window's
 * Places drawer: `columnWidthFor` gives the window's list column its width.
 */
export const SIDEBAR_DEFAULT_WIDTH = 264;
/** The narrowest the sidebar gets. */
export const SIDEBAR_MIN_WIDTH = 180;
/** The widest the sidebar gets: the list column beside the rail is at most 380px (P3, HAL-20617). */
export const SIDEBAR_MAX_WIDTH = 380;
/** The share of the window the list column takes until the person sets its width. */
export const COLUMN_SHARE = 0.34;

/** What the sidebar's resize edge can set. */
export const SIDEBAR_LIMITS: EdgeLimits = {
  min: SIDEBAR_MIN_WIDTH,
  max: SIDEBAR_MAX_WIDTH,
  reset: SIDEBAR_DEFAULT_WIDTH,
};

/** `width` kept inside 180 to 380 and rounded to a whole pixel. */
export function clampSidebarWidth(width: number): number {
  return clampEdgeWidth(width, SIDEBAR_LIMITS);
}

/**
 * The list column's width in a window `windowWidth` pixels wide (`shell.sidebar-resize`): 34% of
 * it, kept inside 180 to 380.
 *
 * @example
 * columnWidthFor(1024); // 348
 * columnWidthFor(1440); // 380
 */
export function columnWidthFor(windowWidth: number): number {
  return clampSidebarWidth(windowWidth * COLUMN_SHARE);
}

/**
 * The width a key on the sidebar's resize edge asks for (UX 1.3): ← narrower and → wider by 16px,
 * Home the narrowest, End the widest, Enter back to `reset`, 264px unless the window says.
 * `undefined` for a key the edge doesn't use.
 */
export function sidebarWidthForKey(
  key: string,
  width: number,
  reset = SIDEBAR_DEFAULT_WIDTH,
): number | undefined {
  return edgeWidthForKey(key, width, { ...SIDEBAR_LIMITS, reset }, "end");
}
