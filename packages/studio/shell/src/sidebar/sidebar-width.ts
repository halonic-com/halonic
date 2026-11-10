/** The sidebar's width when nobody has changed it, and what double-click or Enter go back to. */
export const SIDEBAR_DEFAULT_WIDTH = 264;
/** The narrowest the sidebar gets. */
export const SIDEBAR_MIN_WIDTH = 180;
/** The widest the sidebar gets. */
export const SIDEBAR_MAX_WIDTH = 640;
/** How far ← and → move the resize edge. */
export const SIDEBAR_WIDTH_STEP = 16;

/** `width` kept inside 180 to 640 and rounded to a whole pixel. */
export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));
}

/**
 * The width a key on the resize edge asks for, the window-splitter keys (UX 1.3): ← narrower and
 * → wider by 16px, Home the narrowest, End the widest, Enter back to 264px. It stops at the ends,
 * with no wrap. `undefined` for a key the edge doesn't use.
 */
export function sidebarWidthForKey(key: string, width: number): number | undefined {
  switch (key) {
    case "ArrowLeft":
      return clampSidebarWidth(width - SIDEBAR_WIDTH_STEP);
    case "ArrowRight":
      return clampSidebarWidth(width + SIDEBAR_WIDTH_STEP);
    case "Home":
      return SIDEBAR_MIN_WIDTH;
    case "End":
      return SIDEBAR_MAX_WIDTH;
    case "Enter":
      return SIDEBAR_DEFAULT_WIDTH;
    default:
      return undefined;
  }
}
