# token-store.get-set-remove

- Status: active
- Since: 0.1.0
- Source: HAL-620

The token store shall return the last value set for a token, including an empty string, return `null` once it is removed or when it was never set, and treat removing a missing token as no change.

## Examples

- Given a token set to `first` and then `second`,
  when it is read,
  then the store returns `second`.
- Given a token set to `""`,
  when it is read,
  then the store returns `""`, not `null`.
- Given no token `missing`,
  when it is removed,
  then nothing is appended to the record store.
