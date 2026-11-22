# engine.task-unusable-route

- Status: active
- Since: unreleased
- Source: HAL-16441, Liam's addition for HAL-16471 (a tag-routed workflow sends a triage answer it can't use to the full path)

When a `task` state's agent gives an answer its `json` or `choice` output can't use, no retry is left (`engine.task-answer-retries`), and the state has a transition on the event `unusable`, the engine shall end the step with the event `unusable` and take that transition instead of failing the run. It shall first write `agent.finished` with the `state`, the `agent`, `output: null`, and the `error`, `reason` and `cause` the run would have failed with (`events.agent-finished-error`), and set no output in the context. Such a state reads its agent's answers as with `answerRetries` 1, even when the agent has none: no answer at all to a `json` output counts as unusable, as an empty text already does, and the engine first looks for the JSON in a text answer (`engine.task-answer-json-found`). A usable answer ends the step with `done`, as before. When the state has no transition on `unusable`, an unusable answer shall fail the run, as before. Only `task` states take it: a `parallel` branch and a `foreach` item fail at the first unusable answer, as before.

## Examples

- Given a `choice` agent with `answerRetries: 1` in a state with `on: [{ event: unusable, to: full }, { to: sorted }]`,
  when both answers are "Refund",
  then the run writes `agent.answer-retried`, then `agent.finished` with `output: null` and reason `answer-not-an-option`, and moves to `full` on `unusable`.
- Given the same state and an agent without `answerRetries`, when its first answer is "Refund",
  then the run moves to `full` at once.
- Given a `json` agent in that state that gives no answer,
  then the run moves to `full`.
- Given the same state, when the answer is "refund",
  then the run moves to `sorted` on `done`.
