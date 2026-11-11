# engine.task-json-answer

- Status: active
- Since: 0.1.0
- Source: [HAL-4756](/HAL/issues/HAL-4756) (parity gap `json-output-stays-text`, found on [HAL-1541](/HAL/issues/HAL-1541))

When the answer to a plain `task` state's call comes back and the agent's output is `json`, the engine shall parse a text answer as JSON, with the whitespace around it trimmed, and finish the state as for any answer, with the parsed value as the output, so `agent.finished`, the context and later paths such as `{{context.fields.amount}}` hold data, not text. A text answer that is one Markdown code fence around JSON, with or without a language tag, shall be parsed from inside the fence. An answer that is already data, as a harness can give, shall be kept as it is. When a text answer isn't JSON, the engine shall fail the run with the reason `error` and an error that names the agent, quotes the answer (at most 120 characters) and says to tighten the agent's instructions or use a larger model. It shall never keep the text in place of the data. Model answers and harness results are parsed alike. A `parallel` branch's answer and a `foreach` item's answer shall be parsed the same way: a branch whose answer isn't JSON shall end as a failed branch with the reason `error` (see `engine.parallel-state`), and an item whose answer isn't JSON shall fail the run with an error that names the item. The engine doesn't check the answer against the output's `schema`.

## Examples

- Given an agent `checker` whose output is `json`,
  when its call answers `{"ok": true}`,
  then the engine records `agent.finished` with `{ ok: true }`, sets the state's `output` to `{ ok: true }` and moves on.
- Given the same agent,
  when its call answers "```json", a new line, `{"amount": 12}`, a new line and "```",
  then the engine records `{ amount: 12 }`.
- Given the same agent,
  when its call answers `The amount looks fine.`,
  then the run fails with reason `error`, and the error names `checker` and quotes the answer.
- Given a `parallel` state whose branch `amount` runs `checker`,
  when the branch's call answers `ok`,
  then the engine records `agent.finished` for `amount` with `output: null` and `reason: "error"`.
- Given a `foreach` state whose agent is `checker`,
  when item 0's call answers `{"ok": true}`,
  then the engine records `agent.finished` for item 0 with `{ ok: true }`.
