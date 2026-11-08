# format.collection-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2), ported from 784f78d `packages/core/schema/src/collections.ts`

When `parseFile` reads a collection file, the format shall accept the old `Collection` schema: an id of lowercase letters, digits and `-`, at least one field, field names of letters, digits and `_`, a `choice` field with values and a `ref` field with a collection, views with filters, and seed records with an id. Checking and folding records is runtime work outside the file format.

## Examples

- Given one `money` field, when it is parsed, then the field has `required: false` and `implements`, `views` and `seed` are empty.
- Given a `choice` field without values, when it is parsed, then it fails with `custom` at the field.
- Given `fields: {}`, when it is parsed, then it fails with `custom` at `fields`.
