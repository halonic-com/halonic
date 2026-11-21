import {
  type PlacedRoutine,
  type RoutineStart,
  routineStart,
  type TriggerFacts,
  UnknownTriggerValueError,
} from "@halonicjs/routines";
import type { ServerPorts } from "./api.ts";
import { kindedErrorResponse } from "./error-response.ts";

type Runs = ServerPorts["runs"];

/** The trigger a routine's run records: what started it, and the routine's key. */
export type RoutineRunTrigger = NonNullable<Parameters<Runs["start"]>[0]["trigger"]>;

/**
 * What to run for a routine at a trigger, or the 400 answer when its input or
 * prompt names a value the trigger doesn't have. That answer carries the
 * reason `halonic validate` gives, so the caller learns why nothing started
 * instead of the generic 500 (HAL-14883).
 */
export function routineStartOrRefusal(
  placed: PlacedRoutine,
  trigger: TriggerFacts,
): RoutineStart | Response {
  try {
    return routineStart(placed, trigger);
  } catch (error) {
    if (error instanceof UnknownTriggerValueError) return kindedErrorResponse(error);
    throw error;
  }
}

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
