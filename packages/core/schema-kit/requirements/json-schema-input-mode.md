# schema-kit.json-schema-input-mode

- Status: active
- Since: 0.1.0
- Source: new in the core schema-kit package

When `toJsonSchema` describes a schema, schema-kit shall write a JSON Schema 2020-12 document of the input, in which keys with defaults are not required.

## Examples

- Given `s.object({ name: s.string().min(1), local: s.boolean().default(false) }).strict()`,
  when `toJsonSchema` runs,
  then `required` is `["name"]`, `local` has `"default": false` and `additionalProperties` is false.
- Given the recursive guard schema,
  when `toJsonSchema` runs,
  then it is written once under `$defs` and referenced with `$ref`.
- Given the old `Collection` and `Deployments` schemas, which the old export left out,
  when `toJsonSchema` runs,
  then it writes their documents, equal to what Zod 4.6.7 writes in input mode.
