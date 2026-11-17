import type { Box, Point } from "./geometry.ts";

/** What to draw for one arrow: an SVG path, where its head points and where its label goes. */
export interface ArrowShape {
  readonly path: string;
  readonly head: Point;
  /** The direction the head points, in degrees (0 is right, 90 is down). */
  readonly headAngle: number;
  /** Where the label's chip sits, beside the line and never on it: its centre line, and `labelAnchor` says which edge is at `x`. */
  readonly label: Point;
  readonly labelAnchor: "start" | "middle" | "end";
}

/** Space between a line and its label's chip, and half the chip's height, in canvas units. */
const LABEL_GAP = 10;
const LABEL_HALF_HEIGHT = 9;

const LOOP_OUT = 48;

const at = (point: Point): string => `${Math.round(point.x)} ${Math.round(point.y)}`;

/**
 * The arrow from the bottom edge of `from` to the top edge of `to`, as a gentle S-curve. When the
 * two cards share a row, it runs side to side between them. Otherwise (an arrow back up, or from a
 * step to itself) it leaves by the right side of both cards and loops round. So it never runs
 * through either card it joins (`workflows.canvas.arrows`).
 */
export function arrowShape(from: Box, to: Box): ArrowShape {
  const below = to.y >= from.y + from.height;
  if (below) {
    const start = { x: from.x + from.width / 2, y: from.y + from.height };
    const end = { x: to.x + to.width / 2, y: to.y };
    const bend = (end.y - start.y) / 2;
    return {
      path: `M ${at(start)} C ${at({ x: start.x, y: start.y + bend })} ${at({ x: end.x, y: end.y - bend })} ${at(end)}`,
      head: end,
      headAngle: 90,
      // The curve slants by 2·dx/dy at its middle, so a chip clears it by that much over its half height.
      ...labelBeside(
        { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        end.x >= start.x,
        LABEL_GAP + (Math.abs(end.x - start.x) * LABEL_HALF_HEIGHT * 2) / (end.y - start.y),
      ),
    };
  }
  const sameRow = to.y < from.y + from.height && from.y < to.y + to.height;
  if (sameRow && (to.x >= from.x + from.width || from.x >= to.x + to.width)) {
    const rightwards = to.x > from.x;
    const start = { x: rightwards ? from.x + from.width : from.x, y: from.y + from.height / 2 };
    const end = { x: rightwards ? to.x : to.x + to.width, y: to.y + to.height / 2 };
    const bend = (end.x - start.x) / 2;
    return {
      path: `M ${at(start)} C ${at({ x: start.x + bend, y: start.y })} ${at({ x: end.x - bend, y: end.y })} ${at(end)}`,
      head: end,
      headAngle: rightwards ? 0 : 180,
      label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - LABEL_GAP - LABEL_HALF_HEIGHT },
      labelAnchor: "middle",
    };
  }
  const start = { x: from.x + from.width, y: from.y + from.height * 0.35 };
  const end = { x: to.x + to.width, y: to.y + to.height * 0.65 };
  const out = Math.max(start.x, end.x) + LOOP_OUT;
  return {
    path: `M ${at(start)} C ${at({ x: out, y: start.y })} ${at({ x: out, y: end.y })} ${at(end)}`,
    head: end,
    headAngle: 180,
    // Right of the curve's outermost point: the cubic at t = 1/2 with both control points at `out`.
    ...labelBeside(
      { x: (start.x + end.x + 6 * out) / 8, y: (start.y + end.y) / 2 },
      true,
      LABEL_GAP,
    ),
  };
}

/** A chip to one side of `onLine`, `gap` away: to its right (anchored at its left edge) or to its left. */
function labelBeside(onLine: Point, right: boolean, gap: number) {
  return right
    ? { label: { x: onLine.x + gap, y: onLine.y }, labelAnchor: "start" as const }
    : { label: { x: onLine.x - gap, y: onLine.y }, labelAnchor: "end" as const };
}
