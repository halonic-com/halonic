# token-store.token-names

- Status: active
- Since: 0.1.0
- Source: HAL-620

The token store shall treat two names that differ only in case or in `-` versus `_` as the same token, and shall throw a `RangeError` for a name that breaks the `Secrets` name rule, before it reads or writes anything.

## Examples

- Given a token set as `Google-Refresh`,
  when it is read as `google_refresh`,
  then the store returns its value.
- Given the name `1bad`, `bad name` or a name over 128 characters,
  when any method is called,
  then it throws a `RangeError`, and the record store and the secrets are not touched.
