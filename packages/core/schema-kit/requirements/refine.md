# schema-kit.refine

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

When a refined value has a usable shape, schema-kit shall run the refinement and report each problem it finds as a `custom` issue at the refined value's path plus any relative path the refinement gives.

## Examples

- Given `s.record(s.string(), s.number()).refine((d) => Object.keys(d).length > 0, "Name at least one")` and `{}`,
  when it is parsed,
  then there is one `custom` issue at `[]` with that message.
- Given a `refineWith` that reports "A choice field needs values" at `["values"]`,
  when it rejects a value,
  then the issue path ends in `values`.
- Given `s.object({ a: s.string() }).refine(() => false, "no")` and `{ a: 1 }`,
  when it is parsed,
  then only the `invalid_type` issue is reported (the refinement is skipped).
- Given `s.string().min(2).refine(() => false, "no")` and "x",
  when it is parsed,
  then both `too_small` and `custom` are reported.
