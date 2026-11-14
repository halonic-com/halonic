# app.secret-service

- Status: active
- Since: 0.1.0
- Source: HAL-195 plan 9a (the `halonic secret` command), HAL-8311 (`pr9-plan`, approved by Liam)

The app shall set, remove and list the secrets a person keeps in the `SecretStore`, and shall refuse what a person may not set. It shall refuse the token key (`token-key`) and every name under `halonic_token_`, whatever their case or `-` and `_` spelling, for setting and removing, and shall leave them out of the listing. It shall save the sign-in password (`serve-password`) only as a hash made by the `PasswordHasher`, and only when the password is typed twice the same, is not empty and is at most 1024 characters. It shall refuse a bad name or value with a plain reason, and no reason or error it gives shall repeat a value.

## Examples

- Given the name `openai-key` and the value `sk-live-1234`,
  when the person sets it,
  then the store holds `sk-live-1234` under `openai-key`.
- Given the name `Token_Key`,
  when the person sets or removes it,
  then it is refused and the store is unchanged.
- Given the name `serve-password`, the password `correct horse` typed twice,
  when the person sets it,
  then the store holds the hasher's hash and never `correct horse`.
- Given the name `serve-password` and two different passwords,
  when the person sets it,
  then it is refused, the reason repeats neither, and the store is unchanged.
- Given a stored `openai-key`, `serve-password` and `halonic_token_abc`,
  when the person lists the secrets,
  then the names are `openai-key` and `serve-password`, and no value.
