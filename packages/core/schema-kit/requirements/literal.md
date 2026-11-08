# schema-kit.literal

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.literal(value)` schema shall accept only that exact value and report `invalid_value` for anything else.

## Examples

- Given `s.literal(1)` and 1,
  when it is parsed,
  then it passes.
- Given the same schema and "1",
  when it is parsed,
  then there is one `invalid_value` issue.
