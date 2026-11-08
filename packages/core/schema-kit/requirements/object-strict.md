# schema-kit.object-strict

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

If a `.strict()` object gets keys its shape does not name, then schema-kit shall report one `unknown_keys` issue at the object's path that names them, and still run the object's refinements.

## Examples

- Given `s.object({ a: s.string() }).strict()` and `{ a: "x", b: 1, c: 2 }`,
  when it is parsed,
  then there is one `unknown_keys` issue at `[]` with the message `Unknown keys "b", "c"`.
- Given the same schema with `.refine(() => false, "no")` and the same input,
  when it is parsed,
  then there is also a `custom` issue at `[]`.
