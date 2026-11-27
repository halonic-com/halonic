import { Avatar, SKELETON_AFTER_MS, SkeletonBar } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { quickAskWords } from "../quick-ask-words.ts";

/** One breath of the skeleton circle; three of them take 4.8 s, under the 5 s rule. */
const BREATH_MS = 1600;
/** The avatar's fade in as the agents arrive: the theme's `--duration-fast`. */
const FADE_IN_MS = 120;

/** True where motion should stay still: reduced motion, or a page that can't animate (jsdom). */
function still(element: HTMLElement): boolean {
  if (typeof element.animate !== "function") return true;
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * The agent chip's inside (design HAL-19384): while the agents are read, a skeleton circle the
 * avatar's size, a name bar and the chevron's space, drawn after 300 ms (the kit's
 * `SKELETON_AFTER_MS`, so a fast read doesn't flash), breathing at most 3 times and read out as
 * "Loading your agents"; once they're there, the picked agent's avatar, fading in over 120 ms.
 * The skeleton fills the chip's outline as the real chip does, so the text box beside it moves
 * only by the difference between the bar and the name when the agents arrive (HAL-20415).
 */
export function AgentFace({ name }: { readonly name: string | undefined }) {
  return name === undefined ? <AgentSkeleton /> : <ArrivingAvatar name={name} />;
}

function AgentSkeleton() {
  const [shown, setShown] = useState(false);
  const greys = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SKELETON_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const element = greys.current;
    if (!shown || element === null || still(element)) return;
    const breaths = element.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
      duration: BREATH_MS,
      easing: "ease-in-out",
      iterations: 3,
    });
    return () => breaths.cancel();
  }, [shown]);

  return (
    <>
      {/* The circle, the name bar and the chevron's space, spaced as the chip spaces its parts. */}
      <span
        ref={greys}
        data-agent-skeleton=""
        className={shown ? "flex items-center gap-1.5" : "flex items-center gap-1.5 invisible"}
      >
        <SkeletonBar kind="avatar" />
        <span data-name-bar="" className="w-16">
          <SkeletonBar kind="meta" />
        </span>
        <span className="size-3.5 shrink-0" />
      </span>
      {/* There from the start, so screen readers announce the words when they arrive. */}
      <span role="status" className="sr-only">
        {shown ? quickAskWords.loading : ""}
      </span>
    </>
  );
}

function ArrivingAvatar({ name }: { readonly name: string }) {
  const face = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = face.current;
    if (element === null || still(element)) return;
    const fade = element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_IN_MS,
      easing: "ease-out",
    });
    return () => fade.cancel();
  }, []);

  return (
    <span ref={face} className="block">
      <Avatar name={name} />
    </span>
  );
}
