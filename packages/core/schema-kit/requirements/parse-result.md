# schema-kit.parse-result

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

When a schema parses an input, schema-kit shall return the typed value from `parse` and `safeParse` if the input matches, and otherwise throw a `SchemaError` from `parse` or return every issue from `safeParse` without throwing.

## Examples

- Given `s.string()` and the input "hi",
  when it is parsed,
  then `parse` returns "hi" and `safeParse` returns `{ ok: true, value: "hi" }`.
- Given `s.object({ name: s.string(), age: s.number() })` and `{ name: 1 }`,
  when `safeParse` runs,
  then it returns `ok: false` with two issues, one at `["name"]` and one at `["age"]`.
- Given the same schema and input,
  when `parse` runs,
  then it throws a `SchemaError` whose `issues` hold both issues and whose message has one line per issue, such as `name: Expected text, got a number`.
