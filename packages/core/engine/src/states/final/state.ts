import { nothing, type StateHandler } from "../../kernel/registry.ts";
import { signalSent } from "../../kernel/step-signal.ts";

/**
 * A `final` state ends the run on entry, with the context as it is then. A
 * `signal` on it is sent first, so `run.completed` stays the run's last event
 * (`engine.final-signal`): a routine can start on a workflow that ends.
 */
export const finalState: StateHandler<"final"> = {
  type: "final",
  enter: ({ stateId, state, scope }) => ({
    events: [
      ...signalSent(stateId, state, scope, []),
      { type: "run.completed", state: stateId, context: scope.context },
    ],
    effects: [],
  }),
  // The run has ended, so `decide` passes no input to an entered final state.
  onInput: () => nothing,
};
