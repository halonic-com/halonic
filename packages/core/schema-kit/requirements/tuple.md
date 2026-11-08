# schema-kit.tuple

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.tuple([...])` schema shall accept a list with one item per position, check each at its index, and report a list of the wrong length as `too_small` or `too_big`.

## Examples

- Given `s.tuple([s.unknown(), s.unknown()])` and `[1, 2]`,
  when it is parsed,
  then it passes.
- Given the same schema and `[1]`,
  when it is parsed,
  then there is one `too_small` issue.
- Given `s.tuple([s.string(), s.number()])` and `[1, "a", 3]`,
  when it is parsed,
  then there are issues at `[]`, `[0]` and `[1]`.
