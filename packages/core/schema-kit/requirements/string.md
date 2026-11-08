# schema-kit.string

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.string()` schema shall accept only text, and its `min`, `max` and `regex` checks shall report `too_small`, `too_big` and `invalid_format`, counting length in Unicode code points.

## Examples

- Given `s.string()` and the number 5,
  when it is parsed,
  then there is one `invalid_type` issue.
- Given `s.string().min(2)` and "😀",
  when it is parsed,
  then there is a `too_small` issue, because the emoji is one character.
- Given `s.string().min(1).regex(/^a/, "start with a")` and "",
  when it is parsed,
  then there are two issues, `too_small` and `invalid_format` with the message "start with a".
- Given `s.string().regex(/a/g)` and "a" parsed twice,
  when both parses run,
  then both pass (the pattern's position is reset each time).
