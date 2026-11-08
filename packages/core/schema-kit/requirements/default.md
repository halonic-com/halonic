# schema-kit.default

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

When the input is `undefined` or an object key is missing, the `.default(value)` schema shall use a one-level copy of the value without checking it.

## Examples

- Given `s.object({ local: s.boolean().default(false) })` and `{}`,
  when it is parsed,
  then the value is `{ local: false }`.
- Given `s.array(s.string()).default([])` parsed twice,
  when the first result is changed,
  then the second result is still `[]`.
- Given `s.number().default(3).optional()` inside an object and a missing key,
  when it is parsed,
  then the key gets 3.
