/**
 * The motions of the rail's white dot, in the order Settings lists them (`shell.rail-dot`). Lead
 * is the default.
 *
 * @example
 * railDotMotions.map((motion) => <option key={motion}>{motion}</option>)
 */
export const railDotMotions = ["lead", "streak", "pulse"] as const;

/**
 * How the rail's white dot goes to a newly selected icon: `lead` thins a little on its way,
 * `streak` stretches into a line of light, and `pulse` moves as Lead and opens a ring as it lands.
 */
export type RailDotMotion = (typeof railDotMotions)[number];

/**
 * The attribute on the window's root element (`<html>`) that names the chosen motion, set the way
 * the theme sets `data-theme`. Without it, or with a value that isn't a {@link RailDotMotion}, the
 * dot moves as Lead.
 *
 * @example
 * document.documentElement.setAttribute(railDotMotionAttribute, "streak");
 */
export const railDotMotionAttribute = "data-rail-dot-motion";

/** The motion the window's root element names; Lead when it names none or one we don't know. */
export function chosenRailDotMotion(root: Element): RailDotMotion {
  const chosen = root.getAttribute(railDotMotionAttribute);
  return railDotMotions.find((motion) => motion === chosen) ?? "lead";
}

/** A point in the rail's own coordinates, in pixels from its top left corner. */
export interface RailPoint {
  readonly x: number;
  readonly y: number;
}

/** The theme's values for the dot, read from `theme.css` (`kit.rail-dot-tokens`). Times in ms. */
export interface RailDotTokens {
  readonly easeDot: string;
  readonly easeRing: string;
  readonly lead: number;
  readonly streak: number;
  readonly ring: number;
  readonly fade: number;
}

/** One Web Animations API call: on the dot or on the ring, with these keyframes and this timing. */
export interface RailDotStep {
  readonly part: "dot" | "ring";
  readonly keyframes: Keyframe[];
  readonly timing: KeyframeAnimationOptions;
}

/** A move of the dot from the old icon's point to the new one's. */
export interface RailDotMove {
  readonly motion: RailDotMotion;
  readonly from: RailPoint;
  readonly to: RailPoint;
  /** The person prefers reduced motion: the dot fades and nothing travels, stretches or opens. */
  readonly reduced: boolean;
  readonly tokens: RailDotTokens;
}

/**
 * How far each motion stretches the dot at the middle of its way (`s` in MOTION.md on HAL-20742),
 * and which time it takes. Pulse's dot is Lead's. A new motion is one more line here.
 */
const shapes: Readonly<Record<RailDotMotion, { stretch: number; time: "lead" | "streak" }>> = {
  lead: { stretch: 0.6, time: "lead" },
  streak: { stretch: 5, time: "streak" },
  pulse: { stretch: 0.6, time: "lead" },
};

/** The dot's shape is given at nine moments, a linear clock between them. */
const shapeSteps = 8;

/** The ring opens when the dot is 70% through its time, and grows from 28px to 58px. */
const ringStart = 0.7;
const ringScale = ["0.7", "1.45"] as const;
const ringOpacity = [0.7, 0] as const;

/**
 * The animations that take the dot from `from` to `to`. The dot rests at `to` already (its `left`
 * and `top`), so the keyframes are offsets from there and need no fill: when an animation ends or
 * is cancelled, the dot is where it belongs. `translate` and `scale` are separate properties, so
 * the position keeps its curve while the shape runs on a linear clock.
 *
 * @example
 * for (const step of railDotSteps(move)) parts[step.part].animate(step.keyframes, step.timing);
 */
export function railDotSteps(move: RailDotMove): RailDotStep[] {
  const { motion, from, to, tokens } = move;
  const start = `${from.x - to.x}px ${from.y - to.y}px`;
  if (move.reduced) {
    return [fade(start, tokens.fade)];
  }
  const { stretch, time } = shapes[motion];
  const duration = tokens[time];
  const steps: RailDotStep[] = [
    {
      part: "dot",
      keyframes: [{ translate: start }, { translate: "0px 0px" }],
      timing: { duration, easing: tokens.easeDot },
    },
    { part: "dot", keyframes: shapeKeyframes(stretch), timing: { duration, easing: "linear" } },
  ];
  return motion === "pulse" ? [...steps, ...ringSteps(tokens)] : steps;
}

/** Under reduced motion the dot fades out on the old icon and in on the new one, never between. */
function fade(start: string, duration: number): RailDotStep {
  return {
    part: "dot",
    keyframes: [
      { opacity: 1, translate: start, offset: 0 },
      { opacity: 0, translate: start, offset: 0.5 },
      { opacity: 0, translate: "0px 0px", offset: 0.5 },
      { opacity: 1, translate: "0px 0px", offset: 1 },
    ],
    timing: { duration, easing: "linear" },
  };
}

/**
 * The dot's width and height along its way: thinner and longer towards the middle, round again
 * at both ends. The rail is a column, so the dot stretches along y.
 */
function shapeKeyframes(stretch: number): Keyframe[] {
  return Array.from({ length: shapeSteps + 1 }, (_, step) => {
    const bulge = Math.sin((Math.PI * step) / shapeSteps);
    const width = (1 - 0.15 * bulge) / Math.sqrt(1 + stretch * bulge);
    const height = (1 - 0.15 * bulge) * (1 + stretch * bulge);
    return { scale: `${twoPlaces(width)} ${twoPlaces(height)}`, offset: step / shapeSteps };
  });
}

function twoPlaces(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The ring is not shown at rest (`opacity: 0`). `fill: forwards` keeps it hidden once it has
 * faded; filling backwards too would show it at 70% while it waits for the dot.
 */
function ringSteps(tokens: RailDotTokens): RailDotStep[] {
  const timing = {
    duration: tokens.ring,
    delay: Math.round(ringStart * tokens.lead),
    fill: "forwards",
  } as const;
  return [
    {
      part: "ring",
      keyframes: ringScale.map((scale) => ({ scale })),
      timing: { ...timing, easing: tokens.easeRing },
    },
    {
      part: "ring",
      keyframes: ringOpacity.map((opacity) => ({ opacity })),
      timing: { ...timing, easing: "linear" },
    },
  ];
}

/**
 * Reads the dot's values from the theme on `element`. A token that isn't there (the theme isn't
 * loaded) reads as 0ms, so the dot is at the new icon at once instead of moving at a guessed pace.
 */
export function readRailDotTokens(element: Element): RailDotTokens {
  const style = getComputedStyle(element);
  const read = (name: string): string => style.getPropertyValue(name).trim();
  return {
    easeDot: read("--ease-dot") || "ease",
    easeRing: read("--ease-pulse-ring") || "ease",
    lead: milliseconds(read("--duration-dot-lead")),
    streak: milliseconds(read("--duration-dot-streak")),
    ring: milliseconds(read("--duration-dot-pulse-ring")),
    fade: milliseconds(read("--duration-rail-fade")),
  };
}

function milliseconds(value: string): number {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) {
    return 0;
  }
  return value.endsWith("ms") ? amount : amount * 1000;
}
