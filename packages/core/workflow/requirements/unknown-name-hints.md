# workflow.unknown-name-hints

- Status: active
- Since: unreleased
- Source: Nina's check C337 (HAL-14257, rows 27–28, code row C21), in HAL-14277

When `validateWorkflow` reports an unknown state or agent, the message shall end with `. Did you mean "<name>"?` when exactly one of the workflow's states, or of the agents the caller lists, has the same letters in other case, or else exactly one is within an edit distance of 2, case aside. When the caller gives the hub of an agent in another hub and the workflow names it, the message shall instead end with `. <agent> is in the hub <hub>; a workflow can only use its own hub's agents.`. Without a hint the message stays the old one. When it looks for unreachable states, a transition to an unknown state shall count as going to the state its "Did you mean" names, so the states after a misspelled `to:` aren't warned about on top of its error; one without a likely state reaches nothing, as before. A routine's unknown agent shall get the same guess from the agents where it runs.

## Examples

- Given a step with `agent: Sorter` and the agent `sorter`,
  when it is checked,
  then the error is `"classify" uses unknown agent "Sorter". Did you mean "sorter"?`.
- Given a step with `agent: reporter`, an agent in the hub `reports`,
  when it is checked from another hub,
  then the error is `"classify" uses unknown agent "reporter". reporter is in the hub reports; a workflow can only use its own hub's agents.`.
- Given `on: - to: reveiw` and a state `review` after it,
  when it is checked,
  then the error is `"draft" goes to unknown state "reveiw". Did you mean "review"?`, and neither `review` nor a state after it is unreachable.
- Given `on: - to: nowhere`, with no state near it, and a state `lost` that nothing goes to,
  when it is checked,
  then `lost` can never be reached.
