# schema-kit.nesting-limit

- Status: active
- Since: 0.1.0
- Source: new in the core schema-kit package

If an input is nested more than 256 keys and indexes deep, then `parse` shall return one `too_deep` issue at the path of the first value past the limit, without running the schema.

## Examples

- Given a recursive schema `{ child?: Tree }` and a value nested 100,000 levels,
  when it is parsed,
  then `parse` returns `ok: false` with one `too_deep` issue and does not throw. (Zod alone overflows the call stack.)
- Given the old guard schema and a guard nested 200 levels,
  when it is parsed,
  then it passes.
- Given a map that contains itself,
  when it is parsed,
  then `parse` returns one `too_deep` issue. (Zod alone accepts it.)
