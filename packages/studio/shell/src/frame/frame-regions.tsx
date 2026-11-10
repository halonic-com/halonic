import { type RefObject, useEffect, useRef } from "react";
import type { Announcer, LiveRegion } from "../announcer/announcer.ts";

/** Props for {@link FrameRegions}. */
export interface FrameRegionsProps {
  readonly announcer: Announcer;
}

/**
 * The window's own polite and assertive live regions, mounted once into the announcer. They stay
 * empty until something is announced, and are visually hidden. The assertive region has no
 * `role="alert"`, so a screen reader doesn't read it twice.
 */
export function FrameRegions({ announcer }: FrameRegionsProps) {
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frames = new Set<number>();
    const unmount = announcer.mountRegions({
      polite: regionFor(polite, frames),
      assertive: regionFor(assertive, frames),
    });
    return () => {
      unmount();
      for (const frame of frames) {
        cancelAnimationFrame(frame);
      }
    };
  }, [announcer]);

  return (
    <>
      <div ref={polite} aria-live="polite" className="sr-only" />
      <div ref={assertive} aria-live="assertive" className="sr-only" />
    </>
  );
}

/**
 * A region that clears itself and sets the text on the next frame, so a screen reader reads the
 * same text again when it repeats.
 */
function regionFor(element: RefObject<HTMLDivElement | null>, frames: Set<number>): LiveRegion {
  return {
    say(text) {
      const region = element.current;
      if (region === null) {
        return;
      }
      region.textContent = "";
      const frame = requestAnimationFrame(() => {
        frames.delete(frame);
        region.textContent = text;
      });
      frames.add(frame);
    },
  };
}
