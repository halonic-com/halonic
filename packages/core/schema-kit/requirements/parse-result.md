# schema-kit.parse-result

- Status: active
- Since: 0.1.0
- Source: new in the core schema-kit package

When `parse` checks an input against a schema, schema-kit shall return `ok` with the parsed value, defaults filled in, if the input matches, and otherwise `err` with every issue, and it shall never throw for any input.

## Examples

- Given `s.object({ name: s.string(), local: s.boolean().default(false) })` and `{ name: "a" }`,
  when it is parsed,
  then the result is `{ ok: true, value: { name: "a", local: false } }`.
- Given `s.object({ name: s.string(), age: s.number() })` and `{ name: 1 }`,
  when it is parsed,
  then the result is `ok: false` with two `invalid_type` issues, at `["name"]` and `["age"]`.
- Given any generated value, including maps without a prototype and sparse lists,
  when an old file schema parses it,
  then `parse` returns and does not throw.
