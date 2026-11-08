# schema-kit.discriminated-union

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3)

The `s.discriminatedUnion(key, [...])` schema shall check a map with the one option whose literal value for the key matches, and if no option matches it shall report `unknown_discriminator` at that key.

## Examples

- Given the agent output schema with `type: text | choice | json` and `{ type: "choice", options: [] }`,
  when it is parsed,
  then there is one `too_small` issue at `["options"]`.
- Given the same schema and `{ type: "other" }`,
  when it is parsed,
  then there is one `unknown_discriminator` issue at `["type"]`.
- Given two options with the same literal value,
  when the schema is built,
  then building it throws.
