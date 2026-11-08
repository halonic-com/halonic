# google-setup.staged-replace

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan A1; design 4.3)

When a new client secret is staged for a client ref with a saved secret, the store shall keep it as `google-client-<clientRef>-staged` and leave the secret in use unchanged. When the staged secret is promoted, the store shall make it the secret in use and remove the staged copy. When it is discarded, the store shall remove only the staged copy. The store shall throw `ClientSecretError` `not-saved` when staging for a ref with no saved secret, and `nothing-staged` when promoting with nothing staged.

## Examples

- Given a saved secret A and a staged secret B,
  when the secret in use is read,
  then it is A.
- Given a saved secret A and a staged secret B,
  when B is promoted,
  then the secret in use is B and nothing is staged.
- Given a saved secret A and a staged secret B,
  when B is discarded,
  then the secret in use is A and nothing is staged.
- Given a saved secret and nothing staged,
  when it is promoted,
  then the call throws `ClientSecretError` `nothing-staged` and the secret in use doesn't change.
