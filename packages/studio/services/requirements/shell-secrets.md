# services.shell-secrets

- Status: active
- Since: 0.1.0
- Source: HAL-2874, HAL-2611 (the Tauri secrets adapter), HAL-2923

When the Studio runs in the desktop shell, a workspace's services shall have the OS keychain, through the Tauri secrets adapter, as both their `Secrets` and their `TokenStore`. Outside the shell they shall provide neither, and say so, so the app can provide another store.

Tokens and secrets shall live in separate namespaces of the keychain: the `TokenStore` shall store every token under the prefix `halonic_token_`, and the `Secrets` shall refuse, with a `RangeError` that doesn't repeat the name, any name that starts with that prefix, `token-key` or `serve-password`, in any case and with `-` or `_`. A token shall not be readable through the `Secrets`.

## Examples

- Given a page in the shell,
  when a workspace opens and a token is set through its `TokenStore`,
  then the shell receives `secret_set` for the prefixed name, and the `Secrets` find nothing under the token's own name.
- Given a page in the shell,
  when a workspace asks its `Secrets` for `HALONIC-TOKEN-google_refresh` or `Token_Key`,
  then the call is refused and the keychain is not asked.
- Given a page in the shell,
  when a token name is too long to fit the keychain's 128 characters once prefixed,
  then the call is refused.
- Given a page opened in a browser,
  when a workspace opens,
  then neither service is provided.
