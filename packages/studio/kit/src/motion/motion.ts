/*
 * The Studio's four motions (design review HAL-18481, section 3): something arrives (`enter`),
 * something goes (`leave`), list rows glide to their new place (`flip`) and a pane changes
 * (`swap`). Plain Web Animations, no library. Durations, curves and distances come from the
 * theme's tokens, so theme.css stays the one place they are written. Under reduced motion
 * nothing moves: only the short fades stay, and rows jump into place.
 */

/** Which way an arriving element moves as it fades in. */
export type EnterMove = "rise" | "drop" | "none";

/** Options for `enter`. */
export interface EnterOptions {
  /**
   * `rise` (the default) comes up `--motion-rise` from below, as a new message does; `drop` comes
   * down from above, as a new list row does; `none` only fades, as an opened panel does.
   */
  move?: EnterMove;
}

/**
 * Where the new content of a pane comes from: `in` slides `--motion-slide` from the end (you went
 * in), `back` from the start (you came back), `none` only fades (the pane didn't move).
 */
export type SwapDirection = "in" | "back" | "none";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** What one motion reads from the theme for the element it plays on. */
interface Tokens {
  fast: number;
  base: number;
  rise: number;
  slide: number;
  easeEnter: string;
  easeExit: string;
  easeStandard: string;
}

/**
 * Fades the element in, rising `--motion-rise` from below by default, over `--duration-base` with
 * `--ease-enter`. Under reduced motion only a `--duration-fast` fade. Resolves when it ends.
 */
export function enter(element: HTMLElement, options: EnterOptions = {}): Promise<void> {
  if (!canAnimate(element)) {
    return Promise.resolve();
  }
  const tokens = readTokens(element);
  const reduced = prefersReducedMotion();
  const move = reduced ? "none" : (options.move ?? "rise");
  const offset = { rise: tokens.rise, drop: -tokens.rise, none: 0 }[move];
  const keyframes: Keyframe[] =
    offset === 0
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: `translateY(${offset}px)` },
          { opacity: 1, transform: "translateY(0)" },
        ];
  return playAnimation(element, keyframes, {
    duration: reduced ? tokens.fast : tokens.base,
    easing: tokens.easeEnter,
  });
}

/**
 * Fades the element out over `--duration-fast` with `--ease-exit`, the same with reduced motion,
 * since a fade doesn't move anything. Resolves when it ends; the caller then removes the element.
 */
export function leave(element: HTMLElement): Promise<void> {
  if (!canAnimate(element)) {
    return Promise.resolve();
  }
  const tokens = readTokens(element);
  return playAnimation(element, [{ opacity: 1 }, { opacity: 0 }], {
    duration: tokens.fast,
    easing: tokens.easeExit,
    fill: "forwards",
  });
}

/** Plays one animation on an element and resolves when it ends: the browser's own by default. */
export type Animate = (
  element: HTMLElement,
  keyframes: Keyframe[],
  timing: KeyframeAnimationOptions,
) => Promise<void>;

/**
 * Takes a decided card away once its final state showed (`kit.settle`, motion 6 of the design
 * review): it fades out over `--duration-fast` with `--ease-exit`, then its height and the space
 * above it close over `--duration-base` with `--ease-standard`, so what is below moves up into its
 * place without a jump. The first of a list has no space above it, so it takes in the space below
 * it instead, the next one's top margin, which that one loses as it becomes the first. Under
 * reduced motion only the fade, with nothing moving. Resolves when it ends; the caller then
 * removes the element. `animate` plays each step; a test puts in its own.
 */
export async function settleOut(element: HTMLElement, animate?: Animate): Promise<void> {
  const play = animate ?? (canAnimate(element) ? playAnimation : undefined);
  if (play === undefined) {
    return;
  }
  const tokens = readTokens(element);
  // Measured before the fade, which keeps the element's size.
  const height = `${element.getBoundingClientRect().height}px`;
  const marginTop = getComputedStyle(element).marginTop || "0px";
  const next = element.nextElementSibling;
  const below =
    element.previousElementSibling === null && next !== null
      ? getComputedStyle(next).marginTop || "0px"
      : "0px";
  await play(element, [{ opacity: 1 }, { opacity: 0 }], {
    duration: tokens.fast,
    easing: tokens.easeExit,
    fill: "forwards",
  });
  if (prefersReducedMotion()) {
    return;
  }
  await play(
    element,
    [
      { opacity: 0, height, marginTop, marginBottom: "0px", overflow: "hidden" },
      {
        opacity: 0,
        height: "0px",
        marginTop: "0px",
        marginBottom: `-${below}`,
        overflow: "hidden",
      },
    ],
    { duration: tokens.base, easing: tokens.easeStandard, fill: "forwards" },
  );
}

/**
 * Runs `change`, which adds, removes or reorders the list's children, then glides every child
 * that stayed from its old place to its new one over `--duration-base` with `--ease-standard`
 * (first, last, invert, play). New children are left alone: give them `enter`. Under reduced
 * motion, or where the element can't animate, the rows just jump into place.
 */
export function flip(list: HTMLElement, change: () => void): Promise<void> {
  if (!canAnimate(list) || prefersReducedMotion()) {
    change();
    return Promise.resolve();
  }
  const before = new Map<Element, DOMRect>();
  for (const child of list.children) {
    before.set(child, child.getBoundingClientRect());
  }
  change();
  const tokens = readTokens(list);
  const glides: Promise<void>[] = [];
  for (const child of list.children) {
    const first = before.get(child);
    if (!(first && child instanceof HTMLElement)) {
      continue;
    }
    const last = child.getBoundingClientRect();
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;
    if (deltaX === 0 && deltaY === 0) {
      continue;
    }
    glides.push(
      playAnimation(
        child,
        [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }],
        { duration: tokens.base, easing: tokens.easeStandard },
      ),
    );
  }
  return Promise.all(glides).then(() => undefined);
}

/**
 * Replaces what the pane shows: the old content goes at once (`render` swaps it, so two panes
 * never show together), then the new content fades in over `--duration-base` with
 * `--ease-enter`, sliding `--motion-slide` as `direction` says, mirrored right to left. Under
 * reduced motion only a `--duration-fast` fade.
 */
export function swap(
  pane: HTMLElement,
  render: () => void,
  direction: SwapDirection = "none",
): Promise<void> {
  render();
  if (!canAnimate(pane)) {
    return Promise.resolve();
  }
  const tokens = readTokens(pane);
  const reduced = prefersReducedMotion();
  const fromEnd = getComputedStyle(pane).direction === "rtl" ? -tokens.slide : tokens.slide;
  const offset = reduced ? 0 : { in: fromEnd, back: -fromEnd, none: 0 }[direction];
  const keyframes: Keyframe[] =
    offset === 0
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: `translateX(${offset}px)` },
          { opacity: 1, transform: "translateX(0)" },
        ];
  return playAnimation(pane, keyframes, {
    duration: reduced ? tokens.fast : tokens.base,
    easing: tokens.easeEnter,
  });
}

/** jsdom and older engines have no `element.animate`; there the helpers only make the change. */
function canAnimate(element: HTMLElement): boolean {
  return typeof element.animate === "function";
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

/**
 * Plays one animation and resolves when it ends. A cancelled animation (the element was replaced
 * or another motion took over) also resolves, since nothing went wrong; any other error rejects.
 */
function playAnimation(
  element: HTMLElement,
  keyframes: Keyframe[],
  timing: KeyframeAnimationOptions,
): Promise<void> {
  return element
    .animate(keyframes, timing)
    .finished.then(() => undefined)
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      throw error;
    });
}

function readTokens(element: HTMLElement): Tokens {
  const style = getComputedStyle(element);
  const read = (name: string): string => style.getPropertyValue(name).trim();
  return {
    fast: milliseconds(read("--duration-fast")),
    base: milliseconds(read("--duration-base")),
    rise: pixels(read("--motion-rise")),
    slide: pixels(read("--motion-slide")),
    easeEnter: read("--ease-enter") || "ease",
    easeExit: read("--ease-exit") || "ease",
    easeStandard: read("--ease-standard") || "ease",
  };
}

/**
 * "200ms" or "0.2s" in milliseconds. A token that isn't there (the theme isn't loaded) reads as
 * 0, so the motion ends at once instead of guessing a value theme.css doesn't hold.
 */
function milliseconds(value: string): number {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) {
    return 0;
  }
  return value.endsWith("ms") ? amount : amount * 1000;
}

/** "8px" as 8; a missing token reads as 0, so nothing moves. */
function pixels(value: string): number {
  const amount = Number.parseFloat(value);
  return Number.isNaN(amount) ? 0 : amount;
}
