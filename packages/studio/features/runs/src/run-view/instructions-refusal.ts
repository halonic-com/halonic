import type { InstructionsRefusal, RunEvent, RunSummary } from "@halonicjs/events";

/** A run a harness start refused because a person hasn't trusted the agent's instructions. */
export interface RefusedInstructions extends InstructionsRefusal {
  /** The run's hub, which the agent ran in. */
  readonly hub: string;
  /** The agent that didn't start. */
  readonly agent: string;
}

/**
 * The refusal a failed run ended with, when the harness check stopped it
 * (requirement `runs.run-view.instructions-refusal`); `undefined` for any other run, or a log from
 * before the engine logged the pin.
 *
 * `run.failed` carries the agent and pin; when the check refused a parallel branch it doesn't, so
 * they come from the last branch whose `agent.finished` gave the same reason.
 */
export function refusedInstructions(
  summary: RunSummary,
  log: readonly RunEvent[],
): RefusedInstructions | undefined {
  if (summary.status !== "failed" || summary.reason !== "instructions-not-trusted") {
    return undefined;
  }
  const failed = log.findLast((event) => event.type === "run.failed");
  if (failed?.agent !== undefined && failed.pin !== undefined) {
    return refusal(summary.hubId, failed.agent, failed.pin, failed.changed);
  }
  const branch = log.findLast(
    (event) => event.type === "agent.finished" && event.reason === "instructions-not-trusted",
  );
  return branch?.type === "agent.finished" && branch.pin !== undefined
    ? refusal(summary.hubId, branch.agent, branch.pin, branch.changed)
    : undefined;
}

function refusal(
  hub: string,
  agent: string,
  pin: InstructionsRefusal["pin"],
  changed: boolean | undefined,
): RefusedInstructions {
  return changed === undefined ? { hub, agent, pin } : { hub, agent, pin, changed };
}
