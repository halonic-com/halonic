// How a run ended, for a run that ended on a rejection (HAL-14586, HAL-14592): the ending the
// workflow reached, and whether the agent's last words were turned down. The page shows "Done"
// either way; these say whether it sent.

import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { RunWorkflow } from "../api.ts";
import { stepName } from "../run-words.ts";

/**
 * The ending a completed run reached, as its final state's title: the first line of its
 * description, else its id. `undefined` for a run that didn't complete, and for a workflow with
 * one final state or fewer, where "Finished" already says it all (HAL-11699).
 *
 * @example
 * runEnding(summary, workflow); // "Finished without the reply"
 */
export function runEnding(
  summary: Pick<RunSummary, "status" | "state">,
  workflow: RunWorkflow | undefined,
): string | undefined {
  if (summary.status !== "completed" || summary.state === null) return undefined;
  if ((workflow?.finalStates?.length ?? 0) < 2) return undefined;
  return stepName(summary.state, workflow?.stepDescription(summary.state));
}

/** Who turned an answer down: the person, or one of the workspace's rules. */
export type Rejecter = "you" | "rule";

/**
 * Who rejected the agent's last answer: a wait step answered `reject` or a tool approval
 * rejected after the last agent answer, with no agent answering after it. The latest such
 * rejection decides. `undefined` when nothing was rejected after it, or no agent answered.
 *
 * @example
 * rejectedAfterAgentSaid(events); // "you"
 */
export function rejectedAfterAgentSaid(events: readonly RunEvent[]): Rejecter | undefined {
  let rejecter: Rejecter | undefined;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type === "agent.finished" && event.error === undefined && said(event.output)) {
      return rejecter;
    }
    rejecter ??= rejecterOf(event);
  }
  return undefined;
}

/**
 * Who rejected in this event: a wait step's `reject` is always the person's, a tool approval
 * names who answered it (a log from before it did is the person's).
 */
export function rejecterOf(event: RunEvent | undefined): Rejecter | undefined {
  if (event?.type === "event.received" && event.event === "reject") return "you";
  if (event?.type === "approval.resolved" && !event.approved) {
    return event.by === "rule" ? "rule" : "you";
  }
  return undefined;
}

/** Whether an agent's output says something, as `agentSays` reads it. */
function said(output: unknown): boolean {
  if (output === null || output === undefined) return false;
  return typeof output !== "string" || output.trim() !== "";
}
