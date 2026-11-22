# Decision: an agent can be asked once more after an unusable answer

- Approval: HAL-16441, Liam's task for HAL-16440 (model-mix trials, Timothy's decision of 22 Nov)
- Kind: user-visible

With DeepSeek as the code model, most Halonic Code runs failed at one step
with `answer.not-json`: one malformed answer ended the whole run, though the
code was fine.

**What changes.** The agent file gets an optional `answerRetries` field, 0 or
1 (`format.agent-answer-retries`), so the spec file `agent.schema.json` gains
it. With 1, a `task` state whose answer doesn't fit the agent's `json` or
`choice` output asks the same agent once more in the same step, in a new model
or harness call, with the step's prompt and the error after it
(`engine.task-answer-retries`). Each retry writes a new run-log event,
`agent.answer-retried` (`events.agent-answer-retried`), so the run-log type
test lists one more event type. A second unusable answer fails the run with
the same error, reason and cause as today. `parallel` branches and `foreach`
items keep failing at the first unusable answer, since they track their calls
apart from the task state's.

After the board's analysis of 62 DeepSeek runs (HAL-16440), the same opt-in
also has a `task` state look for the JSON in an answer with text around it
(its one `json` code fence, or else its one top-level `{…}` object;
`engine.task-answer-json-found`), and log the unusable answer in full, with
the JSON parser's error, as `rejected` on `agent.answer-retried` and on
`run.failed` (`events.run-failed-rejected-answer`). So the run-log type test
also lists `rejected` on `run.failed`. Without `answerRetries`, `run.failed`
is written as before, without it.

Nothing is removed or weakened: the field is optional and left out by
default, so every file that parsed before parses the same and every run
without it runs as before. No existing requirement changes.

## Covers

- packages/core/format/spec/agent.schema.json
- packages/core/events/src/run-event.test.ts
