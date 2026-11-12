# engine.foreach-item-gets

- Status: active
- Since: 0.1.0
- Source: [HAL-6982](/HAL/issues/HAL-6982); E8 in [HAL-185's engine bug decisions](/HAL/issues/HAL-185#document-engine-bug-decisions)

When a `foreach` state whose items run its agent picks data with `gets` and has no `input`, the engine shall ask each item's agent with the item, as text or JSON, followed by the picked data, as it does after an `input` or a method's prompt.

## Examples

- Given a for-each state over `paper` and `ink` with `gets: ["input.vendor"]` and no `input`, when it starts, then the first item's agent is asked `paper`, then a `## Data` section with `### input.vendor` and `Acme`.
