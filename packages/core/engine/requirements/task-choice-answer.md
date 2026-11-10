# engine.task-choice-answer

- Status: active
- Since: 0.1.0
- Source: [HAL-3375](/HAL/issues/HAL-3375) (Elena's decision); task HAL-3379; parallel branches and for-each items: [HAL-4456](/HAL/issues/HAL-4456)

When the answer to a plain `task` state's call comes back and the agent's output is a `choice`, the engine shall compare the answer, with the whitespace around it trimmed, to each option, exactly and case-sensitively. When it matches one, the engine shall finish the state as for any answer, with the option itself as the output. When it matches none, or isn't text, the engine shall fail the run with the reason `answer-not-an-option` and an error that names the agent and its options and says to tighten the agent's instructions or use a larger model. It shall not ask again, nor pick the closest option. Model answers and harness results are checked alike. A `parallel` branch's answer and a `foreach` item's answer shall be checked the same way: a matching branch or item keeps the option itself as its output; a branch that matches none shall end as a failed branch with the reason `answer-not-an-option` (see `engine.parallel-state`), and an item that matches none shall fail the run with that reason and an error that names the item.

## Examples

- Given an agent `triage` whose output is a `choice` of `refund`, `complaint` and `question`,
  when its call answers `refund`,
  then the engine records `agent.finished` with `refund`, sets `kind` to `refund` and moves on.
- Given the same agent,
  when its call answers `"  refund\n"`,
  then the engine records `refund`, not the raw text.
- Given the same agent,
  when its call answers `This is a refund.`,
  then the run fails with `answer-not-an-option`, and the error names `triage` and its three options.
- Given the same agent with `harness: claude-code`,
  when its harness run gives `Refund`,
  then the run fails with `answer-not-an-option`.
- Given a `parallel` state whose branch `web` runs agent `searcher`, whose output is a `choice` of `low` and `high`,
  when the branch's call answers `medium`,
  then the engine records `agent.finished` for `web` with `output: null` and `reason: "answer-not-an-option"`, and with the default join the run fails with that reason once every branch has ended.
- Given a `foreach` state whose agent's output is a `choice` of `refunds` and `billing`,
  when item 1's call answers `Refunds`,
  then the run fails with `answer-not-an-option`, and the error names item 1.
