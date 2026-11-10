# contracts.token-store

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `TokenStore` port v1

Where an adapter implements `TokenStore`, it shall create or replace a token on `set`, give it on `get` (or `null` when there is none), delete it on `remove` (a missing token is not an error), and treat names that differ only in case or in `-` versus `_` as the same token. A name that only looks like a valid one shall break the rule and change no token, and a valid name that is also a property of every JavaScript object, such as `constructor`, shall be a token of its own. When a name breaks the secret name rule, every method shall reject with a `RangeError` that doesn't repeat a name over 128 characters or one holding a character that isn't printable ASCII.

## Examples

- Given `google-refresh` is set to `one`,
  when `Google_Refresh` is set to `two`,
  then `google-refresh` reads `two`.
- Given `google-refresh` is set,
  when `GOOGLE-REFRESH` is removed,
  then `google_refresh` reads `null`.
- Given any token store,
  when `set("serve.password", "x")` is called,
  then it rejects with a `RangeError`.
- Given `api-key` is set,
  when `apı-key` (with a dotless i) is set or removed,
  then it rejects with a `RangeError` and `api-key` keeps its value.
- Given an empty token store,
  when `constructor` is read,
  then it gives `null`.
- Given any adapter,
  when a 135-character name or `sérve-password` is set,
  then the `RangeError` doesn't repeat the name.
