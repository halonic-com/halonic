import { SKELETON_AFTER_MS, SkeletonBar } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import { quickAskWords } from "../quick-ask-words.ts";
import { BoxFooter } from "./box-footer.tsx";

/**
 * The box while it reads the agents to ask (requirement `quick-ask.opening`): the kit's skeleton
 * bars in the question row's shape, the agent's picture and the text line, as Messenger's chat
 * list shows its rows while they load (`messenger.load-states`). Nothing shows for 300 ms, so a
 * fast read doesn't flash; then the bars, which screen readers hear as "Loading your agents". The
 * hint row shows at once, so the box is never an empty frame, and nothing moves when the agents
 * arrive.
 */
export function OpeningView() {
  const showing = useShowingAfter(SKELETON_AFTER_MS);
  return (
    <>
      {/* There from the start, so screen readers announce the text when it arrives. */}
      <span role="status" className="sr-only">
        {showing ? quickAskWords.loading : ""}
      </span>
      <div
        data-opening=""
        aria-busy="true"
        className="flex min-h-control-md shrink-0 items-start gap-2 px-3.5 py-3"
      >
        {showing ? (
          <>
            {/* The real row's avatar sits in a button with `p-0.5`, top-aligned; the same box here
                keeps the circle and the text start in place when the agents arrive. */}
            <span data-avatar-box="" className="shrink-0 p-0.5">
              <SkeletonBar kind="avatar" />
            </span>
            <span className="flex min-h-control-md min-w-0 flex-1 items-center">
              <SkeletonBar kind="title" width="1/2" />
            </span>
          </>
        ) : null}
      </div>
      <BoxFooter
        answer={undefined}
        lastAnswer={undefined}
        onOpenChat={noChat}
        onOpenLastAnswer={noChat}
      />
    </>
  );
}

/** Nothing to open while the box reads: the footer shows only the keys. */
function noChat(): void {}

/** Whether `wait` milliseconds have passed since the first render. */
function useShowingAfter(wait: number): boolean {
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    const show = setTimeout(() => setShowing(true), wait);
    return () => clearTimeout(show);
  }, [wait]);
  return showing;
}
