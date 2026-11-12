# engine.parallel-branch-method

- Status: active
- Since: 0.1.0
- Source: [HAL-6983](/HAL/issues/HAL-6983); found in [HAL-4757](/HAL/issues/HAL-4757)

When a branch of a `parallel` state names a `method`, the engine shall ask the branch's agent with the method's prompt (`workflow.method-prompt`), with the branch's `with` values rendered, followed by the picked data, and shall check the branch's answer against the method's `output`, as a plain `task` state does (`engine.task-method`). The branch's model call shall use the method's model, steps and tools, found from the branch the call belongs to, so two branches of one agent can call different methods. When the branch's agent has no method by that name, the engine shall fail the run before any branch starts.

## Examples

- Given a branch `extract` with `agent: clerk`, `method: extract` and `with: { invoice: "{{input.invoice}}" }`, when the state starts, then that branch's agent is asked with the method's prompt, not the run input.
- Given a method that answers with fields, when the branch answers `{"vendor": "Acme Paper", "amount": 120}` as JSON text, then the branch's output is that object.
- Given a branch whose agent has no method `extract`, when the state starts, then the run fails and no branch starts.
