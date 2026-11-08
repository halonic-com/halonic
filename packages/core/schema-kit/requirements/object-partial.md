# schema-kit.object-partial

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

When `.partial()` is called on an object schema, schema-kit shall return a new object schema in which every key is optional, with the same unknown-key mode.

## Examples

- Given `s.object({ gt: s.unknown(), lt: s.unknown() }).partial().strict()` and `{}`,
  when it is parsed,
  then it passes with the value `{}`.
- Given the same schema and `{ eq: 1 }`,
  when it is parsed,
  then there is one `unknown_keys` issue.
