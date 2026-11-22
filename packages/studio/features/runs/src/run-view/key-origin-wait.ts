// "Allow this address?" (UX checklist on HAL-11873, "Prompt open"): while Studio asks a person
// whether a run's model call may send a stored key to an address, the step the run is in shows
// that it waits for their answer.

import type { RunEvent } from "@halonicjs/events";
import { everyStepWords } from "../run-words.ts";

/** A `key-origin.asked` event of the run log. */
type KeyOriginAsked = Extract<RunEvent, { type: "key-origin.asked" }>;

/** What the step that waits shows: the "needs you" mark, read as "waiting for you". */
export const keyOriginWait = {
  mark: "needs-you",
  state: everyStepWords.state.needsYou,
  line: "Waiting for your answer",
} as const;

/**
 * The question "Allow this address?" as the run log says it (requirement
 * `runs.run-view.key-origin-asked`), in the words of its answer's line: who would send which key
 * where. The address is as it is saved.
 */
export function keyOriginAskedWords(
  asked: Pick<KeyOriginAsked, "provider" | "key" | "origin">,
): string {
  return `Asked whether provider "${asked.provider}" may send key "${asked.key}" to ${asked.origin}.`;
}

/**
 * Whether the run waits for a person's answer to "Allow this address?" (requirement
 * `runs.run-view.key-origin-waiting`): the log has a `key-origin.asked` that nothing has closed
 * yet. Its answer for the same key and address closes it. Anything that shows a call may have
 * ended without one closes every open question: the step's own agent starting a new turn, any
 * agent finishing, or the run entering a step or starting to wait. Other events, such as a
 * subagent's model call or a tool call in the same step, can come while a question is open and
 * leave it open.
 */
export function waitsForKeyOriginAnswer(events: readonly RunEvent[]): boolean {
  let open: KeyOriginAsked[] = [];
  for (const event of events) {
    if (event.type === "key-origin.asked") {
      open.push(event);
    } else if (event.type === "key-origin.answered") {
      open = open.filter((asked) => asked.key !== event.key || asked.origin !== event.origin);
    } else if (endsTheCalls(event)) {
      open = [];
    }
  }
  return open.length > 0;
}

/** Whether `event` shows that the questions asked before it no longer wait for an answer. */
function endsTheCalls(event: RunEvent): boolean {
  switch (event.type) {
    case "agent.started":
      return event.parent === undefined;
    // A subagent's question ends with the subagent; showing a wait with no question on screen
    // would send the person looking for one.
    case "agent.finished":
    case "state.entered":
    case "run.waiting":
      return true;
    default:
      return false;
  }
}
