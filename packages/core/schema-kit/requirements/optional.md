# schema-kit.optional

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `.optional()` schema shall also accept `undefined`, and an object shall leave its key out of the parsed value when the input leaves it out.

## Examples

- Given `s.object({ model: s.string().optional() })` and `{}`,
  when it is parsed,
  then the value is `{}` (no `model` key).
- Given `s.string().optional()` and `null`,
  when it is parsed,
  then there is one `invalid_type` issue.
