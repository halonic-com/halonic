import type { RunRow } from "@halonicjs/studio-feature-runs/api";
import { useEffect, useRef } from "react";
import type { ShownRun } from "./run-strip.ts";
import { startWords as words } from "./start-words.ts";

/** Reads a state that may change quickly to screen readers (`announcer.announceState`). */
export type AnnounceState = (key: string, text: string) => void;

/** A run that waits for something; once it runs again, that is worth saying. */
function isWaiting(standing: RunRow["standing"] | undefined): boolean {
  return standing === "waiting" || standing === "needs-you";
}

/**
 * What screen readers hear when the docked run's standing becomes `run.standing`, in microcopy
 * 19.3's words; `undefined` when nothing is said. A run that is simply running says nothing: the
 * card's "Loading run" already told the person it is there. The budget stop and a timed wait are
 * not said, as 19.3's words for them need the cost and the time, which the strip doesn't have.
 *
 * @example
 * runAnnouncement(waitingRun, "running"); // "Run 4defa1 needs you, waiting in Approve this reply?"
 */
export function runAnnouncement(
  run: ShownRun,
  before: RunRow["standing"] | undefined,
): string | undefined {
  const { shortId, step } = run;
  switch (run.standing) {
    case "needs-you":
      return words.announce.needsYou(shortId, step);
    case "done":
      return words.announce.done(shortId);
    case "failed":
      return words.announce.failed(shortId, step);
    case "cancelled":
      return words.announce.cancelled(shortId, step);
    case "running":
    case "cant-try":
      return isWaiting(before) ? words.announce.runningAgain(shortId) : undefined;
    default:
      return undefined;
  }
}

/**
 * While the run's card is docked, reads each change of its standing (microcopy 9.6, a11y check A5).
 * The key is the run page's, `run:<id>`, so a run that is showing in both is read once.
 */
export function useAnnounceDockedRun(
  run: ShownRun | undefined,
  docked: boolean,
  announceState: AnnounceState | undefined,
): void {
  const heard = useRef<{ readonly runId: string; readonly standing: RunRow["standing"] }>(
    undefined,
  );
  useEffect(() => {
    if (run === undefined || !docked) return;
    // `run` is a new object on every runs read; only a new standing is worth reading.
    const before = heard.current?.runId === run.runId ? heard.current.standing : undefined;
    if (before === run.standing) return;
    heard.current = { runId: run.runId, standing: run.standing };
    const text = runAnnouncement(run, before);
    if (text !== undefined) announceState?.(`run:${run.runId}`, text);
  }, [run, docked, announceState]);
}
