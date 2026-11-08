# schema-kit.old-schema-parity

- Status: active
- Since: 0.1.0
- Source: the old schema package (`packages/core/schema`) at 784f78d, which uses Zod 4.6.7

When `parse` checks an input against one of the old repo's file schemas written with `s`, schema-kit shall give the same pass or fail, the same set of issue paths and, on success, an equal parsed value as plain Zod 4.6.7 on the same schema, except for input deeper than the nesting limit (schema-kit.nesting-limit).

## Examples

- Given every file schema of the old repo, written once with Zod and once with `s`,
  when 300 generated inputs per schema and noise level are checked,
  then every verdict matches.
- Given an input with a wrong value at `steps[1].name`,
  when both check it,
  then both report the path `["steps", 1, "name"]`, with `1` a number.
