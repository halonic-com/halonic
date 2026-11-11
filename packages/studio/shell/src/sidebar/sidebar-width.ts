import { clampEdgeWidth, type EdgeLimits, edgeWidthForKey } from "../resize/edge-width.ts";

/** The sidebar's width when nobody has changed it, and what double-click or Enter go back to. */
export const SIDEBAR_DEFAULT_WIDTH = 264;
/** The narrowest the sidebar gets. */
export const SIDEBAR_MIN_WIDTH = 180;
/** The widest the sidebar gets. */
export const SIDEBAR_MAX_WIDTH = 640;

/** What the sidebar's resize edge can set. */
export const SIDEBAR_LIMITS: EdgeLimits = {
  min: SIDEBAR_MIN_WIDTH,
  max: SIDEBAR_MAX_WIDTH,
  reset: SIDEBAR_DEFAULT_WIDTH,
};

/** `width` kept inside 180 to 640 and rounded to a whole pixel. */
export function clampSidebarWidth(width: number): number {
  return clampEdgeWidth(width, SIDEBAR_LIMITS);
}

/**
 * The width a key on the sidebar's resize edge asks for (UX 1.3): ← narrower and → wider by 16px,
 * Home the narrowest, End the widest, Enter back to 264px. `undefined` for a key the edge doesn't
 * use.
 */
export function sidebarWidthForKey(key: string, width: number): number | undefined {
  return edgeWidthForKey(key, width, SIDEBAR_LIMITS, "end");
}
