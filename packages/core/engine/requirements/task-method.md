# engine.task-method

- Status: active
- Since: 0.1.0
- Source: [HAL-4757](/HAL/issues/HAL-4757), known gap `task-method-ignored`; the old engine's run log for the base fixture's `extract` step in `packages/testing/parity/fixtures/base/run-logs.json`

When a plain `task` state names a `method`, the engine shall ask its agent with the method's prompt (`workflow.method-prompt`) with the state's `with` values, followed by the state's picked data (`gets`), instead of its `input` or the run input. It shall check the answer against the method's `output`: a method that answers with fields is read as JSON, as an agent whose `output` is `json` is, and a method that answers with text is kept as it is. The run's model call shall use the method's `model` as its model alias, its `maxSteps` as the most model calls, and, when the method lists `tools`, only the tools of those names (none for `[]`); otherwise the agent's own. When the agent has no method by that name, the engine shall fail the run with an error that names the state, the method and the agent, and call no model. The engine shall read the method from the definitions the run started with, so the run log and its calls keep their shape.

## Examples

- Given the base fixture's `extract` step, when the run enters it, then the agent is asked `Method "extract": Pull the vendor and amount out of an invoice.`, then the instructions with the input's invoice, then the fields line, and the model call uses the alias `careful`, at most 2 model calls and no tools.
- Given that step, when the agent answers `{"vendor": "Acme Paper", "amount": 120}` in a code fence, then `fields` holds that object.
- Given a step that calls `summarize`, which the agent doesn't have, when the run enters it, then the run fails and no model is called.
