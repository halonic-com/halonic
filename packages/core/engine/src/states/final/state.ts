import { nothing, type StateHandler } from "../../kernel/registry.ts";

/** A `final` state ends the run on entry, with the context as it is then. */
export const finalState: StateHandler<"final"> = {
  type: "final",
  enter: ({ stateId, scope }) => ({
    events: [{ type: "run.completed", state: stateId, context: scope.context }],
    effects: [],
  }),
  // The run has ended, so `decide` passes no input to an entered final state.
  onInput: () => nothing,
};
