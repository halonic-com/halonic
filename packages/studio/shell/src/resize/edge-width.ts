/** What a resize edge can set: the narrowest, the widest and what Enter or a double-click give. */
export interface EdgeLimits {
  readonly min: number;
  readonly max: number;
  readonly reset: number;
}

/**
 * The way the pointer or an arrow key moves the edge to make what it resizes wider: `end` for an
 * edge after it (the sidebar's, → is wider), `start` for an edge before it (the side panel's left
 * edge, ← is wider).
 */
export type EdgeSide = "start" | "end";

/** How far ← and → move a resize edge. */
export const EDGE_STEP = 16;

/** `width` kept inside the limits and rounded to a whole pixel. */
export function clampEdgeWidth(width: number, { min, max }: EdgeLimits): number {
  return Math.round(Math.min(max, Math.max(min, width)));
}

/**
 * The width a key on a resize edge asks for, the window-splitter keys (UX 1.3): ← and → move the
 * edge 16px, Home sets the narrowest, End the widest, Enter the reset width. It stops at the ends,
 * with no wrap. `undefined` for a key the edge doesn't use.
 *
 * @example
 * const sidebar = { min: 180, max: 640, reset: 264 };
 * edgeWidthForKey("ArrowRight", 264, sidebar, "end"); // 280
 * edgeWidthForKey("ArrowRight", 700, { min: 420, max: 1400, reset: 700 }, "start"); // 684
 */
export function edgeWidthForKey(
  key: string,
  width: number,
  limits: EdgeLimits,
  side: EdgeSide,
): number | undefined {
  const wider = side === "end" ? "ArrowRight" : "ArrowLeft";
  const narrower = side === "end" ? "ArrowLeft" : "ArrowRight";
  switch (key) {
    case wider:
      return clampEdgeWidth(width + EDGE_STEP, limits);
    case narrower:
      return clampEdgeWidth(width - EDGE_STEP, limits);
    case "Home":
      return limits.min;
    case "End":
      return limits.max;
    case "Enter":
      return clampEdgeWidth(limits.reset, limits);
    default:
      return undefined;
  }
}

/** The width a drag from `startWidth` asks for once the pointer moved `moved` pixels to the right. */
export function edgeWidthForDrag(
  startWidth: number,
  moved: number,
  limits: EdgeLimits,
  side: EdgeSide,
): number {
  return clampEdgeWidth(side === "end" ? startWidth + moved : startWidth - moved, limits);
}
