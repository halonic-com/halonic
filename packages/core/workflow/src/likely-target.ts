import type { Workflow } from "@halonicjs/format";
import { hasState } from "./machine.ts";
import { likelyName } from "./near-name.ts";

/**
 * The state a transition's `to:` goes to, for the checks that follow
 * transitions: the state itself, or for an unknown state the one its "Did you
 * mean" names, so a misspelled `to:` has its own error and no others on the
 * states after it (HAL-14277, HAL-15394). None when no state is likely.
 *
 * @example
 * likelyTarget(workflow, "review"); // "review"
 * likelyTarget(workflow, "reveiw"); // "review"
 * likelyTarget(workflow, "nowhere"); // undefined
 */
export function likelyTarget(workflow: Workflow, to: string): string | undefined {
  return hasState(workflow, to) ? to : likelyName(to, Object.keys(workflow.states));
}
