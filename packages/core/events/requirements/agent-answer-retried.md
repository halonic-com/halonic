# events.agent-answer-retried

- Status: active
- Since: unreleased
- Source: HAL-16441, Liam's task for HAL-16440 (model-mix trials, Timothy's decision of 22 Nov)

The run log shall have an `agent.answer-retried` event for a step that asks its agent again because the answer didn't fit the agent's output, with the step's `state`, its `agent`, the `reason`, the optional `cause` and the `error` the run would have failed with, the `attempt`, counting the step's retries from 1, and the `prompt` of the new call. The event shall have no cost or token use, and shall leave the run running.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `agent.answer-retried` is among them.
- Given an `agent.answer-retried` event,
  when its fields are listed,
  then it has `state`, `agent`, `reason`, `error`, `attempt` and `prompt`, all required, and `cause`, optional.
- Given a run summary,
  when an `agent.answer-retried` event is added,
  then its cost and use don't change, and the run is still running.
