import { useEffect, useRef, useState } from "react";
import type { Point } from "../canvas/geometry.ts";
import {
  advance,
  goalOf,
  headTo,
  LIGHT_FADE_MS,
  type LightFlight,
  restOn,
  restPose,
} from "../canvas/light-flight.ts";

/** The light's core and its glow, in pixels (`--point-of-light-core`, `--point-of-light-glow`). */
const CORE = 8;
const GLOW = 24;

/** Props for {@link PointOfLight}. */
export interface PointOfLightProps {
  /** The status dot the light sits on, in the surface's coordinates; absent when no step is active. */
  readonly target: Point | undefined;
  /** The active step's status colour, as the dot itself uses it. */
  readonly color: string;
  /** Overrides the person's `prefers-reduced-motion`, for a test. */
  readonly reducedMotion?: boolean | undefined;
}

function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = globalThis.matchMedia?.(query);
    if (media === undefined) return;
    const listener = () => setReduced(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/** One light: a core with a soft glow, centred on its box. */
function Dot({
  color,
  style,
  ref,
}: {
  readonly color: string;
  readonly style?: React.CSSProperties;
  readonly ref?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="point-of-light"
      className="pointer-events-none absolute left-0 top-0 block"
      style={{ width: 0, height: 0, ...style }}
    >
      <span
        className="absolute rounded-full forced-colors:hidden"
        style={{
          width: GLOW,
          height: GLOW,
          left: -GLOW / 2,
          top: -GLOW / 2,
          background: `radial-gradient(circle, color-mix(in srgb, ${color} 55%, transparent), transparent 70%)`,
        }}
      />
      <span
        className="absolute rounded-full forced-colors:bg-[Highlight]!"
        style={{ width: CORE, height: CORE, left: -CORE / 2, top: -CORE / 2, background: color }}
      />
    </span>
  );
}

/** The still light of reduced motion: it cross-fades from the old dot to the new one, never travels. */
function StillLight({ target, color }: { readonly target: Point; readonly color: string }) {
  // Each dot is keyed by its place, so the old place's element is the one that fades out.
  const [shown, setShown] = useState({ now: target, before: undefined as Point | undefined });
  const [lit, setLit] = useState(false);
  // Adjusting state while rendering: the target changed, so the old dot becomes the fading one.
  if (shown.now.x !== target.x || shown.now.y !== target.y) {
    setShown({ now: target, before: shown.now });
    setLit(false);
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLit(true));
    const done = setTimeout(
      () => setShown((state) => ({ ...state, before: undefined })),
      LIGHT_FADE_MS,
    );
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [shown.now]);
  const fade = (opacity: number): React.CSSProperties => ({
    opacity,
    transition: `opacity ${LIGHT_FADE_MS}ms linear`,
  });
  return (
    <>
      {shown.before !== undefined && (
        <Dot
          key={`${shown.before.x},${shown.before.y}`}
          color={color}
          style={{ transform: `translate(${shown.before.x}px, ${shown.before.y}px)`, ...fade(0) }}
        />
      )}
      <Dot
        key={`${shown.now.x},${shown.now.y}`}
        color={color}
        style={{
          transform: `translate(${shown.now.x}px, ${shown.now.y}px)`,
          ...fade(lit || shown.before === undefined ? 1 : 0),
        }}
      />
    </>
  );
}

/** The flying, floating light, moved by `requestAnimationFrame` and not by React renders. */
function FlyingLight({ target, color }: { readonly target: Point; readonly color: string }) {
  const dot = useRef<HTMLSpanElement>(null);
  const flight = useRef<LightFlight>(restOn(target));
  const restSince = useRef(0);
  const live = useRef({ visible: true, onScreen: true });
  const frame = useRef<number | undefined>(undefined);

  const draw = (now: number) => {
    const moved = advance(flight.current, now);
    flight.current = moved.flight;
    let { x, y } = moved.position;
    let brightness = 1;
    if (moved.flight.kind === "rest") {
      const pose = restPose(now - restSince.current);
      x += pose.offset.x;
      y += pose.offset.y;
      brightness = pose.brightness;
    } else {
      restSince.current = now;
    }
    const element = dot.current;
    if (element === null) return;
    element.style.transform = `translate(${x}px, ${y}px)`;
    element.style.filter = `brightness(${brightness})`;
  };

  const loop = (now: number) => {
    draw(now);
    frame.current = requestAnimationFrame(loop);
  };
  const sync = () => {
    const run = live.current.visible && live.current.onScreen;
    if (run && frame.current === undefined) {
      // Coming back, it rests on where it was heading rather than playing catch-up.
      flight.current = restOn(goalOf(flight.current));
      frame.current = requestAnimationFrame(loop);
    } else if (!run && frame.current !== undefined) {
      cancelAnimationFrame(frame.current);
      frame.current = undefined;
    }
  };

  useEffect(() => {
    const onVisibility = () => {
      live.current.visible = document.visibilityState !== "hidden";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const observer =
      typeof IntersectionObserver === "undefined" || dot.current === null
        ? undefined
        : new IntersectionObserver((entries) => {
            live.current.onScreen = entries.at(-1)?.isIntersecting ?? true;
            sync();
          });
    if (dot.current !== null) observer?.observe(dot.current);
    onVisibility();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
    };
  }, []);

  useEffect(() => {
    flight.current = headTo(flight.current, target, performance.now());
    // While paused no frame runs, so rest on the new place and draw it now: coming back on screen
    // then finds the light there, not stuck on the old place.
    if (frame.current === undefined) {
      flight.current = restOn(goalOf(flight.current));
      draw(performance.now());
    }
  }, [target.x, target.y]);

  // Only the first place is set by React; after that the frames move the dot, so a re-render
  // never puts it back.
  const [first] = useState<React.CSSProperties>(() => ({
    transform: `translate(${target.x}px, ${target.y}px)`,
  }));
  return <Dot color={color} style={first} ref={dot} />;
}

/**
 * The point of light (`workflows.canvas.point-of-light`): one light for the whole run, resting on
 * the active step's status dot and flying to the next on a soft curve. It sits above the cards
 * and arrows, takes no clicks and is hidden from assistive technology: the step's own text and
 * dot carry everything it shows.
 */
export function PointOfLight({ target, color, reducedMotion }: PointOfLightProps) {
  const preferred = usePrefersReducedMotion();
  if (target === undefined) return null;
  return (reducedMotion ?? preferred) ? (
    <StillLight target={target} color={color} />
  ) : (
    <FlyingLight target={target} color={color} />
  );
}
