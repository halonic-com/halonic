# google-setup.store-names

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan D2, with the security review HAL-705)

The store shall name the client secret `google-client-<clientRef>`, a staged secret `google-client-<clientRef>-staged` and a Google account's refresh token `google-account-<accountRef>`. It shall accept only refs in the shape `randomIds` makes, `<prefix>_<base36 time>_<8 hex>` in lower case, with the prefix `gclient` for a client ref and `gaccount` for an account ref. For any other ref it shall throw a `RangeError` before it reads or writes a token.

## Examples

- Given the client ref `gclient_mfx3k2a1_a1b2c3d4`,
  then the client secret is `google-client-gclient_mfx3k2a1_a1b2c3d4` and the staged one `google-client-gclient_mfx3k2a1_a1b2c3d4-staged`.
- Given the account ref `gaccount_mfx3k2a1_a1b2c3d4`,
  then the refresh token is `google-account-gaccount_mfx3k2a1_a1b2c3d4`.
- Given the ref `Gclient_mfx3k2a1_a1b2c3d4`, `gclient-mfx3k2a1-a1b2c3d4` or `gclient_mfx3k2a1_a1b2c3d4_staged`, which the token store would treat as another ref's token, or `gclient_1`, or an account ref where a client ref belongs,
  when any name is built from it,
  then it throws a `RangeError` and no token is read or written.
