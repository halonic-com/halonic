# memory.secret-name-clash

- Status: active
- Since: 0.1.0
- Source: HAL-650; `Secrets` port v1

When two configured names are the same secret, because they are the same in upper case with `-` as `_`, the memory secrets constructor shall throw a `RangeError` that names both, instead of keeping one of the values.

## Examples

- Given `{ "a-b": "first", "A_B": "second" }`,
  when the secrets are created,
  then it throws a `RangeError` that names `a-b` and `A_B`.
- Given `{ "a-b": "dash", "ab": "none" }`,
  when `A_B` and `AB` are read,
  then they give `dash` and `none`.
