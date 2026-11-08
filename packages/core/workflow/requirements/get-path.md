# workflow.get-path

- Status: active
- Since: 0.1.0
- Source: `getPath` in the old workflow package (`packages/core/workflow/src/template.ts`) at 784f78d

When a dotted path is read from a scope, the workflow rules shall follow each part of the path as a property name, or as an index on a list, and give `undefined` as soon as a part is missing or the value before it is not an object.

## Examples

- Given the scope `{ context: { user: { name: "Ada" } } }`, when `context.user.name` is read, then the result is `"Ada"`.
- Given the scope `{ tags: ["a", "b"] }`, when `tags.0` is read, then the result is `"a"`, and `tags.length` gives 2.
- Given the scope `{ context: {} }`, when `context.user.name` is read, then the result is `undefined`.
- Given the scope `{ input: { name: "Ada" } }`, when `input.name.length` is read, then the result is `undefined`, because a string is not an object.
