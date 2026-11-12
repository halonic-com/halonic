# engine.step-format

- Status: active
- Since: 0.1.0
- Source: [HAL-7037](/HAL/issues/HAL-7037); E8 in [HAL-185's engine bug decisions](/HAL/issues/HAL-185#document-engine-bug-decisions)

When a plain `task` state or a `foreach` state whose items run its agent has a `format`, the engine shall check each answer against that format instead of the agent's `output` and instead of the `output` of the method the state calls: `json` reads the answer as JSON, as an agent whose `output` is `json` is, and `text` keeps it as it is. A state without `format` keeps checking against its method's `output`, else its agent's.

## Examples

- Given a task state with `format: json` whose agent answers in text, when the agent answers `{"ok": true}` in a code fence, then the state's output holds that object.
- Given a task state with `format: text` that calls a method answering with fields, when the agent answers `Vendor: Acme Paper`, then the state's output holds that text.
- Given a for-each state with `format: json`, when an item's agent answers `Looks fine.`, then the run fails.
