# schema-kit.intersection

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.intersection(left, right)` schema shall accept a value that matches both schemas and merge the two parsed maps key by key, and if the two parsed values disagree it shall report `intersection_conflict`.

## Examples

- Given `s.intersection(s.record(s.string(), s.unknown()), s.object({ id: s.string().min(1) }))` and `{ id: "r1", amount: 5 }`,
  when it is parsed,
  then the value is `{ id: "r1", amount: 5 }`.
- Given the same schema and `{ id: "" }`,
  when it is parsed,
  then there is one `too_small` issue at `["id"]`.
- Given `s.intersection(s.object({ a: s.string().default("x") }), s.object({ a: s.string().default("y") }))` and `{}`,
  when it is parsed,
  then there is one `intersection_conflict` issue.
