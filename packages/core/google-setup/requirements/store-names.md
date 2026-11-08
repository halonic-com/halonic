# google-setup.store-names

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan D2)

The store shall name the client secret `google-client-<clientRef>`, a staged secret `google-client-<clientRef>-staged` and a Google account's refresh token `google-account-<accountRef>`. It shall accept only refs of lower-case letters and digits in parts joined by single `_`, starting with a letter, not ending in `_staged`, and short enough that every name fits in 128 characters. For any other ref it shall throw a `RangeError` before it reads or writes a token, with a fixed message that doesn't repeat the ref.

## Examples

- Given the ref `gclient_1`,
  then the client secret is `google-client-gclient_1` and the staged one `google-client-gclient_1-staged`.
- Given the account ref `gaccount_1`,
  then the refresh token is `google-account-gaccount_1`.
- Given the ref `Gclient_1`, `gclient-1` or `gclient_1_staged`, which the token store would treat as another ref's token,
  when any name is built from it,
  then it throws a `RangeError` and no token is read or written.
- Given a pasted client secret where a ref belongs, as with swapped arguments,
  when a name is built from it,
  then the `RangeError` message doesn't contain it.
