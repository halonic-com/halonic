# schema-kit.union

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.union([...])` schema shall return the first option that matches, and if none matches it shall report the issues of the one option that failed only on checks, or else one `no_union_match` issue at the union's path.

## Examples

- Given `s.union([s.string(), s.number()])` and 5,
  when it is parsed,
  then it passes.
- Given the same schema and `true`,
  when it is parsed,
  then there is one `no_union_match` issue at `[]`.
- Given `s.union([s.object({ a: s.string().min(5) }), s.number()])` and `{ a: "x" }`,
  when it is parsed,
  then there is one `too_small` issue at `["a"]`.
