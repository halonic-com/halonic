# schema-kit.null

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.null()` schema shall accept only `null`.

## Examples

- Given `s.null()` and `null`,
  when it is parsed,
  then it passes.
- Given the same schema and `undefined`,
  when it is parsed,
  then there is one `invalid_type` issue.
