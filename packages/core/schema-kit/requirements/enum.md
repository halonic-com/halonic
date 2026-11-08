# schema-kit.enum

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.enum([...])` schema shall accept only the listed texts and report `invalid_value` naming them for anything else.

## Examples

- Given `s.enum(["low", "medium", "high"])` and "medium",
  when it is parsed,
  then it passes.
- Given the same schema and "max",
  when it is parsed,
  then there is one `invalid_value` issue with the message "Expected one of: low, medium, high".
