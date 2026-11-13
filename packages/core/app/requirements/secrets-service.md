# app.secrets-service

- Status: active
- Since: 0.1.0
- Source: HAL-195 PR 9a-2, Liam's conditions in HAL-8311

`SecretsService` shall save, remove and list the secrets a person sets with `halonic secret`, and shall give back a result, never a thrown error, for a refusal. It shall refuse a name that breaks the secret name rule (`invalid-name`) and the names of Halonic's token store, `token-key` and any name under `halonic_token_`, compared in `secretKey` form (`reserved-name`), for `set` and for `remove`; it shall then change nothing. It shall refuse an empty value (`empty-value`) and one over `maxSecretValueLength` (`value-too-long`). `list` shall give names only, sorted as the store sorts them, without the token names. No result shall repeat a value.

## Examples

- Given `openai-key` and a value, when it is set, then the store holds the value and the result is saved.
- Given `Token_Key` or `Halonic-Token-google_refresh`, when it is set or removed, then the result is `reserved-name` and the store is unchanged.
- Given `1key` or `open ai`, when it is set, then the result is `invalid-name`.
- Given an empty value, then `empty-value`; given 65,537 characters, then `value-too-long`.
- Given three saved secrets, when they are listed, then only their names come back.
