# google-setup.remove-client-secret

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan A1; design 4.4)

When a client secret is removed and the caller says another Google account uses the same client ref, the store shall keep it and return `kept-for-other-accounts`. Otherwise the store shall remove the secret in use and any staged secret and return `removed`. Removing a ref with nothing saved is not an error.

## Examples

- Given a saved and a staged secret, and no other account on the ref,
  when the secret is removed,
  then the call returns `removed` and the store holds no token.
- Given a saved secret that another account uses,
  when the secret is removed,
  then the call returns `kept-for-other-accounts` and the secret can still be read.
