# schema-kit.record

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.record(key, value)` schema shall accept a map whose keys all match the key schema and whose values all match the value schema, and report a bad key as `invalid_key` at that key without checking its value.

## Examples

- Given `s.record(s.string().regex(/^[a-z]+$/), s.number())` and `{ ok: 1, Bad: "x" }`,
  when it is parsed,
  then there is one `invalid_key` issue at `["Bad"]`.
- Given `s.record(s.string(), s.number())` and `{ a: "x" }`,
  when it is parsed,
  then there is one `invalid_type` issue at `["a"]`.
