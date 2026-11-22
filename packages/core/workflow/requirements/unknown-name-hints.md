# workflow.unknown-name-hints

- Status: active
- Since: unreleased
- Source: Nina's check C337 (HAL-14257, rows 27–28, code row C21), in HAL-14277; the words from Priya's check C576 (HAL-15424, rows 16–17), in HAL-15431

When `validateWorkflow` reports an unknown agent, the message shall say `"<step>" uses the agent "<agent>", which its hub doesn't have` (for a branch, `Branch "<branch>" of "<step>" uses the agent …`), and for an unknown state `"<step>" goes to the step "<state>", which this workflow doesn't have`, so it holds whether no hub has the agent or another hub does. Either message shall end with `. Did you mean "<name>"?` when exactly one of the workflow's states, or of the agents the caller lists, has the same letters in other case, or else exactly one is within an edit distance of 2, case aside. When the caller gives the hub of an agent in another hub and the workflow names it, the message shall instead end with `. <agent> is in the hub <hub>; a workflow can only use its own hub's agents.`. Without a hint the message ends after its last name. When it looks for unreachable states, a transition to an unknown state shall count as going to the state its "Did you mean" names, so the states after a misspelled `to:` aren't warned about on top of its error; one without a likely state reaches nothing, as before. The checks of a picked `context.<key>` (`unknown-gets`) and of a `{{context.<key>}}` in a template or condition (`unknown-template-name`) shall count such a transition the same way when they look for the steps that run earlier, so the state it likely meant can read what the steps before the misspelling write. A routine's unknown agent shall get the same guess from the agents where it runs.

## Examples

- Given a step with `agent: Sorter` and the agent `sorter`,
  when it is checked,
  then the error is `"classify" uses the agent "Sorter", which its hub doesn't have. Did you mean "sorter"?`.
- Given a step with `agent: reporter`, an agent in the hub `reports`,
  when it is checked from another hub,
  then the error is `"classify" uses the agent "reporter", which its hub doesn't have. reporter is in the hub reports; a workflow can only use its own hub's agents.`.
- Given `on: - to: reveiw` and a state `review` after it,
  when it is checked,
  then the error is `"draft" goes to the step "reveiw", which this workflow doesn't have. Did you mean "review"?`, and neither `review` nor a state after it is unreachable.
- Given `draft` writes `output: reply` and goes `to: reveiw`, and `review` reads `{{context.reply}}`,
  when it is checked,
  then the only issue is `"draft" goes to the step "reveiw", which this workflow doesn't have. Did you mean "review"?`.
- Given `on: - to: nowhere`, with no state near it, and a state `lost` that nothing goes to,
  when it is checked,
  then `lost` can never be reached.
