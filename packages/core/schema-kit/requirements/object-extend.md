# schema-kit.object-extend

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

When `.extend(extra)` is called on an object schema, schema-kit shall return a new object schema with the extra keys added or replaced and the same unknown-key mode.

## Examples

- Given `s.object({ provider: s.string() }).strict().extend({ fallback: s.array(s.string()).default([]) })` and `{ provider: "p" }`,
  when it is parsed,
  then the value is `{ provider: "p", fallback: [] }`.
- Given the same schema and `{ provider: "p", other: 1 }`,
  when it is parsed,
  then there is an `unknown_keys` issue, because the original was strict.
