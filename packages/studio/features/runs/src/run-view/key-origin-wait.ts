// "Allow this address?" (UX checklist on HAL-11873, "Prompt open"): while Studio asks a person
// whether a run's model call may send a stored key to an address, the step the run is in shows
// that it waits for their answer.

import type { RunSummary } from "@halonicjs/events";
import { everyStepWords } from "../run-words.ts";

/** What the step that waits shows: the "needs you" mark, read as "waiting for you". */
export const keyOriginWait = {
  mark: "needs-you",
  state: everyStepWords.state.needsYou,
  line: "Waiting for your answer",
} as const;

/**
 * Whether the run waits for a person's answer to "Allow this address?" (requirement
 * `runs.run-view.key-origin-waiting`): it is running, and its summary has a question still open
 * (requirement `events.summary-key-origin-asked`, which says what opens and closes one).
 */
export function waitsForKeyOriginAnswer(summary: RunSummary): boolean {
  return summary.status === "running" && summary.keyOriginAsked !== undefined;
}
