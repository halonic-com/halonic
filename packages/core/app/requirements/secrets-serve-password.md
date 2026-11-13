# app.secrets-serve-password

- Status: active
- Since: 0.1.0
- Source: HAL-195 PR 9a-2, Liam's conditions in HAL-8311

`SecretsService.set` on `serve-password`, in any spelling that has its `secretKey`, shall need the password a second time and shall refuse when it differs (`confirmation-differs`), when it is empty (`empty-value`) or when it is longer than 1,024 characters, the limit `host/server` sign-in applies (`password-too-long`). It shall save a password the hasher's hash of it, never the password, so a stored `serve-password` is always a valid hash. `asksTwice` shall tell a command which names this applies to. Another name shall not be hashed.

## Examples

- Given `serve-password`, "correct horse" and the same text again, when it is set, then the store holds a hash that verifies "correct horse", and the text itself is nowhere in the store.
- Given `Serve_Password` and two different texts, then `confirmation-differs` and the store is unchanged.
- Given a 1,025-character password, then `password-too-long`.
- Given `openai-key`, then `asksTwice` is false and the value is saved as given.
