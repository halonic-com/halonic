# workflow.guard

- Status: active
- Since: 0.1.0
- Source: `evaluateGuard` in the old workflow package (`packages/core/workflow/src/guards.ts`) at 784f78d

When a guard is checked against a scope, the workflow rules shall render both sides of a comparison as templates first, and then pass `equals` when the two values are the same, `notEquals` when they are not, `contains` when a text holds the other text in any case or a list holds the value, `exists` when the path holds a value other than nothing, `null` or empty text, `not` when the inner guard fails, `all` when every inner guard passes and `any` when one does. Texts are the same without the spaces around them; other values are the same when their JSON is. A missing value is the same as nothing, not even as another missing value.

## Examples

- Given the context `tags: [a, b]`, when `contains: ["{{context.tags}}", "b"]` is checked, then it passes.
- Given the context `text: Hello World`, when `contains: ["{{context.text}}", "world"]` is checked, then it passes.
- Given the context `text: Hello World`, when `exists: "{{ context.text }}"` or `exists: context.text` is checked, then it passes; `exists: context.nope` fails.
- Given the values `" yes\n"` and `"yes"`, when `equals` is checked, then it passes; `1` and `"1"` are not the same.
- Given a context without `nope` or `gone`, when `equals: ["{{context.nope}}", "{{context.gone}}"]` is checked, then it fails and `notEquals` passes.
- Given an empty `all`, when it is checked, then it passes; an empty `any` fails.
