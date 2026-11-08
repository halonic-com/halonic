# workflow.render-template

- Status: active
- Since: 0.1.0
- Source: `render` in the old workflow package (`packages/core/workflow/src/template.ts`) at 784f78d

When a value is rendered against a scope, the workflow rules shall give the raw value at the path for a string that is exactly one `{{path}}` placeholder, so a number stays a number; replace each placeholder in any other string with its value as text, where `undefined` and `null` become empty text, strings stay as they are and other values are written as JSON; and return a value that is not a string unchanged.

## Examples

- Given the scope `{ input: { n: 3, name: "Ada" } }`, when `{{input.n}}` is rendered, then the result is the number 3.
- Given the same scope, when `Hi {{input.name}}, {{input.n}}!` is rendered, then the result is `"Hi Ada, 3!"`.
- Given the same scope, when `{{input.missing}}` is rendered, then the result is `undefined`.
- Given the same scope, when `{{ input.n }}` is rendered, then the result is 3: spaces inside the braces are allowed.
- Given the scope `{ input: { o: { x: 1 }, nothing: null } }`, when `[{{input.o}}|{{input.nothing}}|{{input.missing}}]` is rendered, then the result is `[{"x":1}||]`.
- Given the number 42, when it is rendered, then the result is 42.
- Given any text without `{{`, when it is rendered, then the result is the same text.
