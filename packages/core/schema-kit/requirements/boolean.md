# schema-kit.boolean

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.boolean()` schema shall accept only `true` and `false`.

## Examples

- Given `s.boolean()` and `true`,
  when it is parsed,
  then it passes.
- Given the same schema and "true",
  when it is parsed,
  then there is one `invalid_type` issue.
