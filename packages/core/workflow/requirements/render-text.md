# workflow.render-text

- Status: active
- Since: 0.1.0
- Source: `renderText` in the old workflow package (`packages/core/workflow/src/template.ts`) at 784f78d

When a text is rendered as text against a scope, the workflow rules shall render it as a template and turn the result into text, where `undefined` and `null` become empty text, strings stay as they are and other values are written as JSON.

## Examples

- Given the scope `{ input: { n: 3 } }`, when `{{input.n}}` is rendered as text, then the result is `"3"`.
- Given the scope `{ input: { o: { x: 1 } } }`, when `{{input.o}}` is rendered as text, then the result is `{"x":1}`.
- Given the scope `{ input: {} }`, when `{{input.missing}}` is rendered as text, then the result is empty text.
