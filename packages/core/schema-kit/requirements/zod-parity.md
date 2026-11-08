# schema-kit.zod-parity

- Status: active
- Since: 0.1.0
- Source: HAL-105 (plan 7.3, plan 9.3, D7)

When schema-kit and Zod 4.6.7 check the same input with the same schema, schema-kit shall give the same pass or fail, the same set of issue paths and, on success, an equal parsed value.

## Examples

- Given every file schema of the old repo, built with both libraries,
  when 300 generated inputs per schema and noise level are checked,
  then every verdict matches.
- Given random schemas built from every combinator,
  when generated inputs (wrong types, missing and extra keys, odd Unicode) are checked,
  then every verdict matches.
- Given 3,000 generated URL-like texts,
  when `url()` checks them,
  then every verdict matches Zod's.
