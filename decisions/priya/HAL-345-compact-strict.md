# Decision: two allowed differences in `format.compact`

- Requirement: `format.compact` (`packages/core/format/requirements/compact.md`)
- Task: HAL-345, from the review of HAL-216
- Approval: the maintainer accepted both differences on HAL-216; the maintainer approves this change in review

## What changes

The old app's `compact` (commit `784f78d`) lost data in two cases without saying so. The new one
differs from it in exactly these two cases:

- **Objects that aren't plain data.** The old `compact` read every object through its own
  enumerable keys. A `Date` has none, so `{ at: new Date() }` came out as `{}`, and a `Map` or a
  class instance was flattened the same way. The new `compact` throws a `TypeError` that names the
  kind and where it is, for example "value.at is a Date", as `deepClone` in `@halonicjs/std` does for
  a `Map` or a class instance. A `Date` counts as one of these too: `compact` writes files, and a
  file holds only what YAML or JSON parsing gives.
- **A key named `__proto__`.** `JSON.parse('{"__proto__": {"a": 1}}')` makes an ordinary own key.
  The old `compact` assigned it to the result, which set the result's prototype instead, so the key
  was gone. The new `compact` keeps it as an ordinary key. `Object.prototype` was never changed, and
  still isn't.

To tell plain objects apart, `@halonicjs/std` now exports the `isPlainObject` check that
`deepClone` and `deepEqual` already use (requirement `std.is-plain-object`).

## Why

A writer that gets a value it can't save should say so, not guess what to save. Both cases lost a
value with no error, and the user would only notice when it was missing from the file.

Neither case can come from a file today: the YAML reader uses the core schema, which has no
timestamps and gives plain objects for maps. So no file the old app saved is written differently.

## Tests and golden files

- `reads any other object, such as a Date, through its own keys, like the old app` is replaced by a
  test that the `Date`, `Map` and class instance cases throw. That is the only test that changes, and
  it changes because the behaviour it checked is the one this note retires.
- New tests cover the `__proto__` key and objects made by `Object.create(null)`.
- The golden files `packages/core/format/src/golden/compact.json` and `compact-yaml.json` don't
  change. Neither case is in them.
- When the parity allowed-differences file (HAL-267) lands, both differences move into it.
