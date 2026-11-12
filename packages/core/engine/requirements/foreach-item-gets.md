# engine.foreach-item-gets

- Status: active
- Since: 0.1.0
- Source: [HAL-7037](/HAL/issues/HAL-7037); E8 in [HAL-185's engine bug decisions](/HAL/issues/HAL-185#document-engine-bug-decisions)

When a `foreach` state whose items run its agent picks data with `gets`, the engine shall send each item's agent the picked data after its prompt (`workflow.with-gets`): after the method's prompt or the state's `input`, rendered for the item, and, when the state has neither, after the item itself, as text when it is one and as JSON otherwise.

## Examples

- Given a for-each state over `paper` and `ink` with `gets: [input.vendor]` and no `input`, when it starts, then the first item's agent is asked `paper`, followed by a `## Data` section with `input.vendor`.
