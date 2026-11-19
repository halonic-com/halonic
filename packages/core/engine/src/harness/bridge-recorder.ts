// Where a harness call's bridge writes the model and tool calls it passes
// on. Before each model call goes out, it asks the step's limits and the
// run's budget, and once either is reached it refuses the call and stops
// the harness call (requirements `engine.budget-stops`,
// `engine.harness-step-limits`).

import type { RunEventBody } from "@halonicjs/events";
import type { BridgeRecorder } from "@halonicjs/ports";
import { KindedError, type StopSource } from "@halonicjs/std";
import { BudgetReachedError, BudgetStopError, type CallBudget } from "../budget/call-budget.ts";
import type { HarnessEventLog } from "./run-harness-call.ts";
import type { StepLimits } from "./step-limits.ts";

/**
 * Where the bridge writes its events (model and tool calls), which carry no
 * state. It records a model call's `llm.request` before the call goes out,
 * so a call the budget or a step limit refuses is never logged, and stops
 * the harness call. A model call's cost counts once its `llm.response` is in.
 */
export function bridgeRecorderOf(
  log: HarnessEventLog,
  budget: CallBudget,
  callStop: StopSource,
  stepLimits: StepLimits,
): BridgeRecorder {
  return {
    record: async (event: RunEventBody) => {
      if (event.type === "llm.request") {
        stepLimits.beforeModelCall();
        await keepToBudget(budget, callStop);
      }
      await log.append(event);
      if (event.type === "llm.response") stepLimits.afterModelCall(event.cost);
    },
  };
}

/**
 * Asks the budget before a model call goes out. Once it's reached, it
 * stops the harness call too.
 *
 * @throws KindedError `limit_reached` when the budget refuses the call
 */
async function keepToBudget(budget: CallBudget, callStop: StopSource): Promise<void> {
  try {
    await budget.keep();
  } catch (error) {
    if (error instanceof KindedError && error.kind === "limit_reached") {
      const failureCause = error instanceof BudgetStopError ? error.stop.cause : undefined;
      callStop.stop(new BudgetReachedError(error.message, failureCause));
    }
    throw error;
  }
}
