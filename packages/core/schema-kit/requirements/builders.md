# schema-kit.builders

- Status: active
- Since: 0.1.0
- Source: new in the core schema-kit package

The `s` object shall offer Zod 4.6.7's builders for string, number, boolean, null, unknown, literal, enum, object, array, tuple, record, union, discriminated union, intersection and lazy, and no others, so that every file kind can be written without importing Zod.

## Examples

- Given `s.object({ name: s.string().min(1) }).strict()` and `{ name: "a", extra: 1 }`,
  when it is parsed,
  then there is one `unrecognized_keys` issue at `[]` with the keys `["extra"]`.
- Given `s.discriminatedUnion("type", [s.object({ type: s.literal("a") }), s.object({ type: s.literal("b") })])` and `{ type: "b" }`,
  when it is parsed,
  then it passes.
- Given the list of builders on `s`,
  when it is read,
  then it holds exactly the fifteen names above.
