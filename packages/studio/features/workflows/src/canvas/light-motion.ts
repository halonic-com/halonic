import type { Point } from "./geometry.ts";

/** How far the control point is pushed sideways, as a share of the hop's length (twice the 18 % bow). */
export const LIGHT_BOW = 0.36;
/** The spring's damping ratio: about 4 % past the end, then back. */
export const LIGHT_DAMPING = 0.72;
/** The shortest and the longest a hop takes, in milliseconds. */
export const LIGHT_HOP_MIN_MS = 700;
export const LIGHT_HOP_MAX_MS = 1100;

/** The curve of one hop: a quadratic Bézier from `from` to `to` through `control`. */
export interface LightCurve {
  readonly from: Point;
  readonly control: Point;
  readonly to: Point;
}

/**
 * The curve the light flies from one step's status dot to the next's (`workflows.canvas.point-of-light`).
 * The control point is the midpoint pushed to the left of the direction of travel, so every hop
 * bows the same way: up for a left-to-right flow, to the right for a top-to-bottom one.
 */
export function lightCurve(from: Point, to: Point): LightCurve {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Left of the direction of travel on a screen (y grows downwards) is (dy, -dx).
  return {
    from,
    to,
    control: { x: (from.x + to.x) / 2 + dy * LIGHT_BOW, y: (from.y + to.y) / 2 - dx * LIGHT_BOW },
  };
}

/** How long a hop of `distance` pixels takes: 500 ms plus 2.5 ms a pixel, held between 700 and 1100 ms. */
export function lightHopDuration(distance: number): number {
  return Math.min(LIGHT_HOP_MAX_MS, Math.max(LIGHT_HOP_MIN_MS, 500 + 2.5 * distance));
}

/**
 * How far along the curve the light is `elapsed` milliseconds into a hop of `duration`: a damped
 * spring from rest that settles by the end. It runs past 1 (about 4 %) and comes back; at
 * `duration` it is exactly 1.
 */
export function lightProgress(elapsed: number, duration: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed >= duration) return 1;
  const omega = 7.36 / (duration / 1000);
  const damped = omega * Math.sqrt(1 - LIGHT_DAMPING * LIGHT_DAMPING);
  const tau = elapsed / 1000;
  const decay = Math.exp(-LIGHT_DAMPING * omega * tau);
  return (
    1 -
    decay * (Math.cos(damped * tau) + ((LIGHT_DAMPING * omega) / damped) * Math.sin(damped * tau))
  );
}

/** The point on `curve` at `t`; past 1 the curve simply carries on, which is the overshoot. */
export function lightPoint(curve: LightCurve, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * curve.from.x + 2 * u * t * curve.control.x + t * t * curve.to.x,
    y: u * u * curve.from.y + 2 * u * t * curve.control.y + t * t * curve.to.y,
  };
}
