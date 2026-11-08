# schema-kit.number

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.number()` schema shall accept only finite numbers, and its `min`, `max`, `positive` and `int` checks shall report `too_small`, `too_big` and `not_integer`.

## Examples

- Given `s.number()` and NaN, Infinity or "5",
  when each is parsed,
  then each has one `invalid_type` issue.
- Given `s.number().int().min(1).max(64)` and 1.5,
  when it is parsed,
  then there is one `not_integer` issue and the later checks are skipped.
- Given `s.number().positive()` and 0,
  when it is parsed,
  then there is one `too_small` issue.
- Given `s.number().int()` and 2^60,
  when it is parsed,
  then there is one `too_big` issue (beyond the safe integer range).
