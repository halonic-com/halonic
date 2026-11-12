// A state with `signal` sends it once its output is written. The old engine
// (784f78d) logged `signal.sent` right after the output and the artifact,
// with the data rendered from the context that already held the output, for
// a task, parallel, foreach and workflow state alike; the base fixture's
// recorded run log has one. This keeps that place and that data.

import type { WorkflowState } from "@halonicjs/format";
import { render, type Scope } from "@halonicjs/workflow";
import type { DecidedEvent } from "./decide-types.ts";

/**
 * The `signal.sent` a state sends after `written`, the events that finish it:
 * its data's templates are rendered with the run's input and its context, as
 * the `context.updated` events among `written` leave it.
 *
 * @returns the event to append, or nothing for a state without `signal`
 */
export function signalSent(
  stateId: string,
  state: WorkflowState,
  scope: Scope,
  written: readonly DecidedEvent[],
): DecidedEvent[] {
  const signal = state.signal;
  if (signal === undefined) {
    return [];
  }
  const context = { ...scope.context };
  for (const event of written) {
    if (event.type === "context.updated") context[event.key] = event.value;
  }
  const after = { input: scope.input, context };
  const data = Object.fromEntries(
    Object.entries(signal.data).map(([key, value]) => [key, render(value, after)]),
  );
  return [{ type: "signal.sent", state: stateId, name: signal.name, data }];
}
