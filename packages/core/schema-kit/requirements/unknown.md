# schema-kit.unknown

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.unknown()` schema shall accept any value, while an object key with this schema shall still be required unless it is optional.

## Examples

- Given `s.unknown()` and `undefined`, `null` or `{ a: 1 }`,
  when each is parsed,
  then each passes unchanged.
- Given `s.object({ payload: s.unknown() })` and `{}`,
  when it is parsed,
  then there is one `required` issue at `["payload"]`.
