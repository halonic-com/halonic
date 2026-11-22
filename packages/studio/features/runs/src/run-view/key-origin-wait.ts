// "Allow this address?" (UX checklist on HAL-11873, "Prompt open"): while Studio asks a person
// whether a run's model call may send a stored key to an address, the step the run is in shows
// that it waits for their answer.

import type { RunEvent } from "@halonicjs/events";
import { everyStepWords } from "../run-words.ts";

/** What the step that waits shows: the "needs you" mark, read as "waiting for you". */
export const keyOriginWait = {
  mark: "needs-you",
  state: everyStepWords.state.needsYou,
  line: "Waiting for your answer",
} as const;

/**
 * Whether the run waits for a person's answer to "Allow this address?": the log's last event is
 * the `key-origin.asked` the host wrote before it asked (requirement
 * `runs.run-view.key-origin-waiting`). Only the last event counts, as for a slow step, so once an
 * answer or any other event follows, or a wait that ended without an answer is followed by the
 * call's failure, the step shows no wait.
 */
export function waitsForKeyOriginAnswer(events: readonly RunEvent[]): boolean {
  return events.at(-1)?.type === "key-origin.asked";
}
