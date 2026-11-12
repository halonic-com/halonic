# workflow.method-prompt

- Status: active
- Since: 0.1.0
- Source: [HAL-4757](/HAL/issues/HAL-4757); the old engine's prompt for the base fixture's `extract` step in `packages/testing/parity/fixtures/base/run-logs.json`

When a step calls one of its agent's methods, the workflow rules shall send `Method "<name>": <description>` (or `Method "<name>".` for a method without a description), then the method's instructions with the step's `with` values filled in, then, for a method that answers with fields, `Answer with JSON with these fields: ` and each field as `<name> (<type>)`, with `, may be left out` after the type of an optional field. The parts shall be separated by a blank line. Each `with` value shall be rendered against the run's scope first, so a value that is one placeholder keeps its type, and the instructions shall see only those values. A method that answers with text shall get no fields line.

## Examples

- Given the base fixture's `extract` method and `with: { invoice: "{{input.invoice}}" }`, when the input's invoice is `Acme Paper, 120 EUR`, then the prompt is the one the old engine's run log has for the `extract` step.
- Given a method without a description that answers with text, when the prompt is built, then it is `Method "<name>".`, a blank line and the instructions.
- Given a `with` value that is one placeholder for a list, when the instructions use it inside a text, then the list is written as JSON.
