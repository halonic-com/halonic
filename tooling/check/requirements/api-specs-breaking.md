# check.api-specs-breaking

- Status: active
- Since: 0.1.0
- Source: HAL-1664

If a public API's spec file `<package>/spec/<name>.schema.json` has a breaking change since its newest released copy in `spec/released/` and the `v<N>` in its `$id` is the same as in that copy, then the `api-specs` check shall fail, name the file and each change, and say to bump the API version. A change is breaking when it removes a property or an `enum` value, makes a key newly required, changes a `const`, narrows a `type` (a type no longer allowed), removes an `anyOf` or `oneOf` alternative or adds an `allOf` one, anywhere in the schema. A change that widens the schema is not breaking: adding an optional property, an `enum` value, a type to a `type` list or an `anyOf`/`oneOf` alternative, or removing the `type` key. A spec file without a released copy passes. The check compares with the released copy, not with git, so it answers the same locally and in CI.

## Examples

- Given a released `agent` spec and a current one that adds an optional property, then the check passes.
- Given a current spec that removes the property `name`, with the same `v1` in its `$id`, then the check fails and names `name`.
- Given a current spec that removes the property `name`, with `v2` in its `$id`, then the check passes.
- Given a current spec that adds `name` to `required`, or removes a value from an `enum`, or changes a `type` to another type or a `const`, with the same `$id`, then the check fails.
- Given a current spec that adds an `anyOf` alternative, widens `type` from `"string"` to `["string", "null"]`, or drops a `type` key, then the check passes. Given one that removes an `anyOf` alternative, then it fails.
