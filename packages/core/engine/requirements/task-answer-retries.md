# engine.task-answer-retries

- Status: active
- Since: unreleased
- Source: HAL-16441, Liam's task for HAL-16440 (model-mix trials, the board's decision of 22 Nov)

When a `task` state's agent gives an answer its `json` or `choice` output can't use, and the agent's `answerRetries` is 1, the engine shall ask the same agent once more in the same step instead of failing the run. It shall write `agent.answer-retried` with the `state`, the `agent`, the `reason`, `cause` and `error` the run would have failed with, the `attempt`, 1, the new `prompt`, and the answer in full in `rejected`, with the JSON parser's error as `parseError` for a `json` output, and ask for one new call: a model call, or a harness call for an agent that runs in a harness. The new prompt is the step's own prompt, a blank line, then "Your answer can't be used: " with the error, without its last sentence of advice to a person, then " The JSON parser said: " and the parser's error when there is one, and "Answer again with only what your output asks for." With `answerRetries` 1, no answer at all to a `json` output counts as unusable as well, on either try, as an empty text already does. When the second answer is unusable too, the run shall fail with the same error, reason and cause it fails with today, and `run.failed` shall carry the second answer in full in `rejected`. A usable second answer finishes the step as a first one would, and a `conversation` keeps the step's own prompt. A result for the first call that comes after the retry changes nothing. When `answerRetries` is 0 or left out, an unusable answer shall fail the run at once, as before. Only `task` states ask again: a `parallel` branch and a `foreach` item fail at the first unusable answer, as before.

## Examples

- Given a `choice` agent with `answerRetries: 1` that answers "This is a refund.",
  when the answer comes back,
  then the run writes `agent.answer-retried` with attempt 1, asks for `call-2` with the new prompt, and keeps running; when `call-2` answers "refund", the run completes with "refund".
- Given the same agent, when the second answer is "Refund" as well,
  then the run fails with `answer-not-an-option` and the cause that names the agent and its options, and `run.failed` has `rejected: { answer: "Refund" }`.
- Given a `json` agent with `answerRetries: 1` that runs in Claude Code and gives no answer,
  when the answer comes back,
  then the run asks for a new harness call with the new prompt.
- Given a `json` agent with `answerRetries: 1` whose answer is `{"a": 1` (cut off),
  when the answer comes back,
  then `agent.answer-retried` has `rejected` with that answer and the parser's error, and the new prompt says what the parser said.
- Given a `choice` agent without `answerRetries`, when it answers "Refund",
  then the run fails at once, as before, and `run.failed` has no `rejected`.
