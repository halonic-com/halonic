import { useLayoutEffect, useRef } from "react";
import {
  chosenRailDotMotion,
  type RailPoint,
  railDotSteps,
  readRailDotTokens,
} from "./rail-dot-motion.ts";

/** Props for {@link RailDot}. */
export interface RailDotProps {
  /** The selected entry's id, or none: then the dot isn't shown. */
  readonly selected: string | undefined;
  /**
   * Changes whenever the rail's buttons move without the selection changing, such as the ids of
   * the entries shown: the dot then goes to its icon's new point without a motion.
   */
  readonly layout: string;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Both parts lie over the buttons at the rail's top left corner and are moved by `left`/`top`. */
const part = "pointer-events-none absolute rounded-full";

/**
 * The rail's one point of light (`shell.rail-dot`): a 6px white dot that rests on the selected
 * icon and travels to a newly selected one, and the ring Pulse opens round it. The rail renders
 * it last inside its `nav`, which must be positioned. The dot finds the selected button by
 * `aria-current="page"`, so it follows the selection however it changed. Which motion plays is
 * read from the window's root element at each move (`railDotMotionAttribute`), so a new choice in
 * Settings shows on the next click. Where the engine has no `element.animate`, the dot is at the
 * new icon at once.
 *
 * @example
 * <nav className="relative …">… <RailDot selected={selected} layout={ids.join(" ")} /></nav>
 */
export function RailDot({ selected, layout }: RailDotProps) {
  const dot = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const state = useRef<DotState>({ rest: undefined, playing: [] });

  // `layout` is a dependency so the dot follows its icon when the buttons move.
  useLayoutEffect(() => {
    const rail = dot.current?.parentElement;
    if (dot.current === null || ring.current === null || rail === null || rail === undefined) {
      return;
    }
    follow({ dot: dot.current, ring: ring.current, rail }, selected, state.current);
  }, [selected, layout]);

  useLayoutEffect(() => {
    const { playing } = state.current;
    return () => stop(playing);
  }, []);

  return (
    <>
      <span
        ref={ring}
        aria-hidden="true"
        data-rail-ring=""
        className={`${part} -m-5 size-10 border-[1.5px] border-rail-pulse opacity-0`}
      />
      <span
        ref={dot}
        aria-hidden="true"
        data-rail-dot=""
        hidden
        className={`${part} -m-0.75 size-1.5 bg-point-of-light shadow-point-of-light`}
      />
    </>
  );
}

interface Parts {
  readonly dot: HTMLElement;
  readonly ring: HTMLElement;
  readonly rail: HTMLElement;
}

/** Where the dot rests and for which entry, and the animations still held from the last move. */
interface DotState {
  rest: { readonly id: string; readonly point: RailPoint } | undefined;
  readonly playing: Animation[];
}

/** Puts the dot on the selected button, and plays the move there when the selection changed. */
function follow(parts: Parts, selected: string | undefined, state: DotState): void {
  const to = selected === undefined ? undefined : selectedPoint(parts.rail);
  const before = state.rest;
  // A click during a move starts again from where the dot is; nothing queues.
  const from = before === undefined ? undefined : whereItIs(parts, state.playing, before.point);
  stop(state.playing);
  parts.dot.hidden = to === undefined;
  if (selected === undefined || to === undefined) {
    state.rest = undefined;
    return;
  }
  place(parts.dot, to);
  place(parts.ring, to);
  state.rest = { id: selected, point: to };
  if (from !== undefined && before?.id !== selected) {
    play(parts, from, to, state.playing);
  }
}

function play(parts: Parts, from: RailPoint, to: RailPoint, playing: Animation[]): void {
  const steps = railDotSteps({
    motion: chosenRailDotMotion(parts.rail.ownerDocument.documentElement),
    from,
    to,
    reduced: globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false,
    tokens: readRailDotTokens(parts.rail),
  });
  for (const step of steps) {
    const element = parts[step.part];
    // jsdom and older engines have no `element.animate`; there the dot is at the new icon at once.
    if (typeof element.animate === "function") {
      playing.push(element.animate(step.keyframes, step.timing));
    }
  }
}

/** The centre of the selected button, in the rail's own coordinates. */
function selectedPoint(rail: HTMLElement): RailPoint | undefined {
  const button = rail.querySelector('[aria-current="page"]');
  return button === null ? undefined : centreIn(button, rail);
}

function centreIn(element: Element, rail: HTMLElement): RailPoint {
  const box = element.getBoundingClientRect();
  const frame = rail.getBoundingClientRect();
  return { x: box.left + box.width / 2 - frame.left, y: box.top + box.height / 2 - frame.top };
}

/** Mid-move the dot is where its box is drawn; at rest it's at the point it was placed at. */
function whereItIs(parts: Parts, playing: readonly Animation[], rest: RailPoint): RailPoint {
  const moving = playing.some((animation) => animation.playState === "running");
  return moving ? centreIn(parts.dot, parts.rail) : rest;
}

function place(element: HTMLElement, point: RailPoint): void {
  element.style.left = `${point.x}px`;
  element.style.top = `${point.y}px`;
}

function stop(playing: Animation[]): void {
  for (const animation of playing.splice(0)) {
    animation.cancel();
  }
}
