import type { Point } from "./geometry.ts";
import {
  type LightCurve,
  lightCurve,
  lightHopDuration,
  lightPoint,
  lightProgress,
  smootherstep,
} from "./light-motion.ts";

/** How far the resting light floats from its dot, in pixels, and how long one turn takes. */
export const LIGHT_FLOAT_RADIUS = 2;
export const LIGHT_FLOAT_MS = 7000;
/** One way of the breath, in milliseconds, and the brightness it moves between. */
export const LIGHT_BREATH_MS = 3600;
export const LIGHT_BREATH_MIN = 0.85;
export const LIGHT_BREATH_MAX = 1.3;
/** How long the float and the breath take to ease in after a landing, in milliseconds. */
export const LIGHT_REST_EASE_MS = 800;
/** How long the cross-fade takes when the person asked for less motion (`--duration-fast`). */
export const LIGHT_FADE_MS = 120;

/** Where the light is: resting on a dot, or flying a hop, with at most one place to go next. */
export type LightFlight =
  | { readonly kind: "rest"; readonly at: Point }
  | {
      readonly kind: "hop";
      readonly curve: LightCurve;
      readonly startedAt: number;
      readonly duration: number;
      /** The newest step, if one became active while this hop was under way. */
      readonly next?: Point | undefined;
    };

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

function hop(from: Point, to: Point, startedAt: number): LightFlight {
  return {
    kind: "hop",
    curve: lightCurve(from, to),
    startedAt,
    duration: lightHopDuration(Math.hypot(to.x - from.x, to.y - from.y)),
  };
}

/** The light resting on `at`. */
export const restOn = (at: Point): LightFlight => ({ kind: "rest", at });

/**
 * Sends the light to `target` (`workflows.canvas.point-of-light-rest`). At rest it lifts off at
 * once. In flight it finishes the hop it is on and then goes straight on to `target`: one light,
 * never a queue, so a newer target replaces an older one that was waiting.
 */
export function headTo(flight: LightFlight, target: Point, now: number): LightFlight {
  if (flight.kind === "rest") return same(flight.at, target) ? flight : hop(flight.at, target, now);
  if (same(flight.curve.to, target)) return { ...flight, next: undefined };
  return { ...flight, next: target };
}

/** Where the light has got to by `now`, and the flight to carry on from. */
export function advance(
  flight: LightFlight,
  now: number,
): { readonly flight: LightFlight; readonly position: Point } {
  let current = flight;
  while (current.kind === "hop" && now - current.startedAt >= current.duration) {
    const landed = current.curve.to;
    const landedAt = current.startedAt + current.duration;
    current =
      current.next === undefined || same(current.next, landed)
        ? restOn(landed)
        : hop(landed, current.next, landedAt);
  }
  if (current.kind === "rest") return { flight: current, position: current.at };
  const progress = lightProgress(now - current.startedAt, current.duration);
  return { flight: current, position: lightPoint(current.curve, progress) };
}

/** Where the light is going: the end of the hop it is on, or of the one waiting after it. */
export function goalOf(flight: LightFlight): Point {
  if (flight.kind === "rest") return flight.at;
  return flight.next ?? flight.curve.to;
}

/**
 * The float and the breath of a resting light `ms` after it landed: an offset and a brightness.
 * Both ease in over {@link LIGHT_REST_EASE_MS}: the light lands at full brightness exactly on its
 * dot, then the float grows to 2 px and the brightness settles into the breath, with no jump.
 */
export function restPose(ms: number): { readonly offset: Point; readonly brightness: number } {
  const turn = (2 * Math.PI * ms) / LIGHT_FLOAT_MS;
  const breath = 0.5 - 0.5 * Math.cos((Math.PI * ms) / LIGHT_BREATH_MS);
  const settled = LIGHT_BREATH_MIN + (LIGHT_BREATH_MAX - LIGHT_BREATH_MIN) * breath;
  const weight = smootherstep(ms / LIGHT_REST_EASE_MS);
  return {
    offset: {
      x: weight * LIGHT_FLOAT_RADIUS * Math.cos(turn),
      y: weight * LIGHT_FLOAT_RADIUS * Math.sin(turn),
    },
    brightness: 1 + (settled - 1) * weight,
  };
}
