# schema-kit.recursive

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.lazy(getter)` schema shall check a value with the schema its getter returns, so that a schema can contain itself, and it shall call the getter only once.

## Examples

- Given the workflow guard schema and `{ all: [{ not: { exists: "input.x" } }] }`,
  when it is parsed,
  then it passes.
- Given the same schema and `{ all: [{ not: { exists: 1 } }] }`,
  when it is parsed,
  then there is one `no_union_match` issue at `[]`, because no option of the outermost union matches either.
