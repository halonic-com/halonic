# engine.foreach-item-method

- Status: active
- Since: 0.1.0
- Source: HAL-4757; E8 in HAL-185's engine bug decisions (HAL-185)

When a `foreach` state whose items run its agent names a `method`, the engine shall ask each item's agent with the method's prompt (`workflow.method-prompt`), with the state's `with` values rendered for that item (its `as` name and `index`), followed by the picked data, and shall check each answer against the method's `output`, as a plain `task` state does (`engine.task-method`). Each item's model call shall use the method's model, steps and tools. When the agent has no method by that name, the engine shall fail the run before any item starts.

## Examples

- Given a for-each state over `paper` and `ink` with `as: line` and `with: { line: "{{line}}", place: "{{index}}" }`, when it starts, then the first item's agent is asked with `Check line 0: paper` inside the method's prompt.
- Given a method that answers with fields, when the items answer `{"ok": true}` and `{"ok": false}`, then the output list holds both objects.
