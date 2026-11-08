# schema-kit.object-passthrough

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

When a `.passthrough()` object gets keys its shape does not name, schema-kit shall keep them unchecked in the parsed value.

## Examples

- Given `s.object({ name: s.string() }).passthrough()` and `{ name: "a", license: "MIT" }`,
  when it is parsed,
  then the value is `{ name: "a", license: "MIT" }`.
