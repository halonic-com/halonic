# token-store.old-values-removed

- Status: active
- Since: 0.1.0
- Source: HAL-719, from the security review in HAL-705 (plan D1); `RecordStore` port v2

When the token store replaces or removes a token, it shall compact `_tokens`, so the old sealed value is no longer anywhere in the collection's changes. It shall not compact when it adds a new token.

## Examples

- Given a token that is set and then set again,
  when the changes of `_tokens` are read,
  then they hold one `seed` with the new sealed value and not the old one.
- Given two tokens of which one is removed,
  when the changes of `_tokens` are read,
  then only the other token is in them.
- Given a token that is set for the first time,
  when the changes of `_tokens` are read,
  then they hold its `add` change.
