import type { RunFailure } from "@halonicjs/app/run-failure";
import { type Phrase, phrase } from "./phrase.ts";

// Line 2 of a run that failed on a problem in its workflow: the same fixes
// `validate` gives for that problem, so the two commands agree (HAL-14313).

type FailureOf<Reason extends RunFailure["reason"]> = Extract<RunFailure, { readonly reason: Reason }>;

/**
 * The fix for items that aren't a list, as `validate`'s items-not-a-list gives it. Only a list
 * the run's input or context gives as something else is left to the run.
 *
 * @example
 * itemsNotAListFix({ reason: "items-not-a-list", items: "monday", … });
 * // Write one placeholder, such as "{{context.topics}}".
 */
export function itemsNotAListFix(failure: FailureOf<"items-not-a-list">): Phrase {
  const path = placeholderPath(failure.items);
  if (path === undefined) {
    return phrase`Write one placeholder, such as "{{context.topics}}".`;
  }
  if (!/^(input|context)\./.test(path)) {
    return phrase`Read the list from input or context, such as "{{context.${path}}}".`;
  }
  return failure.gives === "nothing"
    ? phrase`Check the name in ${failure.items}, and pass a JSON list there, such as ["Monday", "Tuesday"].`
    : phrase`Pass a JSON list, such as ["Monday", "Tuesday"].`;
}

/**
 * The fix for an event no transition takes, as `validate`'s no-done-transition gives it: a
 * transition without event takes done.
 *
 * @example
 * noTransitionFix({ reason: "no-transition", event: "done", takes: ["sent"], guarded: false, … });
 * // Remove event: sent, or add a transition without event.
 */
export function noTransitionFix(failure: FailureOf<"no-transition">): Phrase {
  if (failure.guarded) {
    return phrase`Add a transition for ${failure.event} without when, as the last one, so the run always has somewhere to go.`;
  }
  if (failure.event !== "done") {
    return phrase`Add a transition with event: ${failure.event}.`;
  }
  if (failure.takes.length === 0) {
    return phrase`Add a transition without event.`;
  }
  const [only, ...more] = failure.takes;
  return only !== undefined && more.length === 0
    ? phrase`Remove event: ${only}, or add a transition without event.`
    : phrase`Remove their event, or add a transition without event.`;
}

/** The fix for a task step with no agent, as `validate`'s task-without-agent gives it. */
export function taskWithoutAgentFix(): Phrase {
  return phrase`Give it an agent (agent: <id>), or make it a wait step.`;
}

/** The path of items that are one placeholder and nothing else, such as "input.topics". */
function placeholderPath(items: string): string | undefined {
  return /^\{\{\s*([^{}\s]+)\s*\}\}$/.exec(items.trim())?.[1];
}
