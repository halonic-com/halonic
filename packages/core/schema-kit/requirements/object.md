# schema-kit.object

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.object(shape)` schema shall accept a map, check every key of its shape, report a missing required key as `required` at that key, drop unknown keys, and return a new object.

## Examples

- Given `s.object({ name: s.string() })` and `{ name: "a", extra: 1 }`,
  when it is parsed,
  then the value is `{ name: "a" }`.
- Given the same schema and `{}`,
  when it is parsed,
  then there is one `required` issue at `["name"]`.
- Given the same schema and a list,
  when it is parsed,
  then there is one `invalid_type` issue at `[]`.
