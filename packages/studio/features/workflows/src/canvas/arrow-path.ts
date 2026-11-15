import type { Box, Point } from "./geometry.ts";

/** What to draw for one arrow: an SVG path, where its head points and where its label goes. */
export interface ArrowShape {
  readonly path: string;
  readonly head: Point;
  /** The direction the head points, in degrees (0 is right, 90 is down). */
  readonly headAngle: number;
  readonly label: Point;
}

const LOOP_OUT = 48;

const at = (point: Point): string => `${Math.round(point.x)} ${Math.round(point.y)}`;

/**
 * The arrow from the bottom edge of `from` to the top edge of `to`, as a gentle S-curve. When `to`
 * is not below `from` (an arrow back up, or one to the same row), the arrow leaves by the right
 * side of both cards and loops round, so it never runs through a card. An arrow from a step to
 * itself is a loop on its right side (`workflows.canvas.arrows`).
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
      label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    };
  }
  const start = { x: from.x + from.width, y: from.y + from.height * 0.35 };
  const end = { x: to.x + to.width, y: to.y + to.height * 0.65 };
  const out = Math.max(start.x, end.x) + LOOP_OUT;
  return {
    path: `M ${at(start)} C ${at({ x: out, y: start.y })} ${at({ x: out, y: end.y })} ${at(end)}`,
    head: end,
    headAngle: 180,
    label: { x: out, y: (start.y + end.y) / 2 },
  };
}
