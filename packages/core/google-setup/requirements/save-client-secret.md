# google-setup.save-client-secret

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan A1, D1, D2; design 4.2)

When a Google client secret is saved, the store shall trim the spaces around it, keep it in the `TokenStore` as `google-client-<clientRef>` under a new client ref from the `IdGenerator`, and return only that ref. When the value is empty after trimming, the store shall throw `ClientSecretError` `empty` and write nothing.

## Examples

- Given an empty store and ids from `fixedIds()`,
  when a secret is saved,
  then the call returns `gclient_1` and the token `google-client-gclient_1` holds the secret.
- Given a secret pasted with spaces and a line break around it,
  when it is saved and read back,
  then the value has no spaces around it.
- Given a value of only spaces,
  when it is saved,
  then the call throws `ClientSecretError` `empty` and the store holds no token.
