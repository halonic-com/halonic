# format.json-schema-goldens

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 7.3, 8, 9.3 point 6)

The format shall describe every file kind as a JSON Schema 2020-12 document of what the file may contain (keys with a default not required), equal to its committed spec file `spec/<kind folder>.schema.json`; this includes `collection` and `deployments`, which the old export left out. A missing or changed spec file fails the test, and CI never writes one. The spec file is the source of truth outsiders read for the kind (HAL-1664).

## Examples

- Given the `agent` kind, when its JSON Schema is made, then `required` is `[id, name]`.
- Given the `collection` kind, when its JSON Schema is made, then it requires `id`, `name` and `fields` and allows no other keys.
- Given any kind, when its JSON Schema differs from its spec file or the file is missing, then the test fails.
