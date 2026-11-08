# schema-kit.builders

- Status: active
- Since: 0.1.0
- Source: new in the core schema-kit package; `json` and `url` for the recording file (HAL-143)

The `s` object shall offer Zod 4.6.7's builders for string, number, boolean, null, unknown, literal, enum, object, array, tuple, record, union, discriminated union, intersection, lazy and json, plus `url`, and no others, so that every file kind can be written without importing Zod. `url` accepts only an absolute `http` or `https` URL as `URL` writes it: lower-case scheme and host (a name, a dotted IPv4 address or a bracketed IPv6 address), an optional port, no user or password, and after the host only RFC 3986 characters and `%` with two hex digits.

## Examples

- Given `s.object({ name: s.string().min(1) }).strict()` and `{ name: "a", extra: 1 }`,
  when it is parsed,
  then there is one `unrecognized_keys` issue at `[]` with the keys `["extra"]`.
- Given `s.discriminatedUnion("type", [s.object({ type: s.literal("a") }), s.object({ type: s.literal("b") })])` and `{ type: "b" }`,
  when it is parsed,
  then it passes.
- Given the list of builders on `s`,
  when it is read,
  then it holds exactly the seventeen names above.
- Given `s.url()` and `https://www.googleapis.com/drive/v3/files?q=%27root%27+in+parents`,
  when it is parsed,
  then it passes.
- Given `s.url()` and `mailto:family@example.com`, `HTTPS://api.example.com/` or `https://user@example.com/`, which Zod's `z.url()` accepts,
  when it is parsed,
  then there is one `invalid_format` issue at `[]`.
