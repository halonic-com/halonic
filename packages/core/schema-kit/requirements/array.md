# schema-kit.array

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.array(item)` schema shall check every item at its index and report `too_small` or `too_big` for its `min` and `max`; a list over its maximum shall be refused before its items are checked.

## Examples

- Given `s.array(s.string())` and `["a", 2]`,
  when it is parsed,
  then there is one `invalid_type` issue at `[1]`.
- Given `s.array(s.string()).min(1)` and `[]`,
  when it is parsed,
  then there is one `too_small` issue at `[]`.
- Given `s.array(s.number()).max(2)` and a list of a million strings,
  when it is parsed,
  then there is only one `too_big` issue.
