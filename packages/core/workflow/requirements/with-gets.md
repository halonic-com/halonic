# workflow.with-gets

- Status: active
- Since: 0.1.0
- Source: `withGets` in the old workflow package (`packages/core/workflow/src/inputs.ts`) at 784f78d

When a step has picked data (`gets`), the workflow rules shall send its prompt without the spaces around it, then a `## Data` section with each picked path as a `###` heading followed by its value: text as it is, anything else as JSON indented by two spaces, and `(not set)` for a value that isn't there. When a step picks nothing, the rules shall send the prompt unchanged. A step that picks data and has no `input` sends the `## Data` section alone (`workflow.state-input`).

## Examples

- Given the prompt `Check this mail.` and the picks `input.message` (`Hi there`), `context.tags` (`[school]`) and `context.missing`, when the prompt is built, then the data section holds `Hi there`, the list as indented JSON and `(not set)`, in that order.
- Given no picks, or an empty list, when the prompt is built, then it is the prompt as it was.
- Given a pick whose value is `null`, when the prompt is built, then its value reads `null`.
