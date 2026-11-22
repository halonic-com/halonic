// Run now's start of what a routine runs, as the scheduler would start it.
// Split from the routines host, which checks trust and the target first.

import { shortRunId } from "@halonicjs/app";
import type { Routine } from "@halonicjs/format";
import { routineKey, routineStart } from "@halonicjs/routines";
import type { RunNowResult } from "@halonicjs/studio-feature-routines/api";
import type { RoutineRunStart } from "../engine/engine-service.ts";
import { runNowFailureOf } from "./run-now-failure.ts";
import type { WorkspaceRoutinesParts } from "./workspace-routines.ts";

/**
 * Starts the routine's workflow or agent now, with `at` as its trigger's time.
 *
 * @throws what {@link runNowFailureOf} makes of the engine's error: EngineNotAnswering only when
 * the engine can't be reached, else the refusal with its own words
 */
export async function startRoutineNow(
  placed: { readonly hub: string | null; readonly routine: Routine },
  engine: NonNullable<WorkspaceRoutinesParts["engine"]>,
  at: Date,
): Promise<RunNowResult> {
  try {
    const key = routineKey(placed);
    // A manual start has no earlier run to name, so `{{trigger.lastRun}}` is null.
    const what = routineStart(placed, { at, lastRun: null });
    if (what.hub === null)
      throw new Error(`Routine ${key} runs outside a hub, so it must name one.`);
    const start: RoutineRunStart =
      "workflow" in what
        ? { workflow: { hubId: what.hub, workflowId: what.workflow, input: what.input } }
        : { agent: { hubId: what.hub, agentId: what.agent, prompt: what.prompt } };
    const { id } = await engine.start(start, { routineKey: key, at: at.toISOString() });
    return { started: true, runId: id, shortId: shortRunId(id) };
  } catch (error) {
    throw runNowFailureOf(error);
  }
}
