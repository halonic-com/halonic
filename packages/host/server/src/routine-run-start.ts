import type { RoutineStart } from "@halonicjs/routines";
import type { ServerPorts } from "./api.ts";

type Runs = ServerPorts["runs"];

/** The trigger a routine's run records: what started it, and the routine's key. */
export type RoutineRunTrigger = NonNullable<Parameters<Runs["start"]>[0]["trigger"]>;

/**
 * Starts the workflow or the agent a routine names, in `hubId`, with the
 * trigger that started it. A webhook passes the run id its delivery always
 * gets; Run now passes none.
 */
export function startRoutineRun(
  runs: Runs,
  hubId: string,
  start: RoutineStart,
  trigger: RoutineRunTrigger,
  runId?: string,
): ReturnType<Runs["start"]> {
  const id = runId === undefined ? {} : { runId };
  return "workflow" in start
    ? runs.start({ hubId, workflowId: start.workflow, input: start.input, trigger, ...id })
    : runs.startAgent({ hubId, agentId: start.agent, prompt: start.prompt, trigger, ...id });
}
