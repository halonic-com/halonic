# format.json-schema-goldens

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 7.3, 8, 9.3 point 6)

The format shall describe every file kind as a JSON Schema 2020-12 document of what the file may contain (keys with a default not required), equal to its committed golden file; this includes `collection` and `deployments`, which the old export left out. A missing or changed golden file fails the test, and CI never writes one.

## Examples

- Given the `agent` kind, when its JSON Schema is made, then `required` is `[id, name]`.
- Given the `collection` kind, when its JSON Schema is made, then it requires `id`, `name` and `fields` and allows no other keys.
- Given any kind, when its JSON Schema differs from its golden file, then the test fails.
