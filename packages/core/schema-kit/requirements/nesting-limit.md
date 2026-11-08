# schema-kit.nesting-limit

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 9.3 (hostile input))

If a value checked by a recursive schema sits more than 256 keys and indexes deep, then schema-kit shall report one `too_deep` issue at that path instead of overflowing the stack.

## Examples

- Given a recursive schema `{ child?: Tree }` and a value nested 100,000 levels,
  when it is parsed,
  then `safeParse` returns `ok: false` with one `too_deep` issue and does not throw.
- Given the same schema and a guard nested 200 levels,
  when it is parsed,
  then it passes.
