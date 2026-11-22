# user-secrets.bound-context

- Status: active
- Since: unreleased
- Source: HAL-16242, split from HAL-13223 (end-user secrets in the selling layer design, HAL-12483)

The user secrets package shall bind a wrapped data key, through AES-GCM's additional data, to its end user's id, its key version and the key-encryption key's id, and bind each sealed secret to the end user's id, the secret's name in `secretKey` form and the data key's version. When a wrapped data key or a sealed secret is opened for another end user, another name or another key version, it shall throw an `UnreadableUserSecretError` and give no value.

## Examples

- Given a data key wrapped for `eu_acme`,
  when it is unwrapped for `eu_globex`, or with its version changed,
  then it throws an `UnreadableUserSecretError`.
- Given a secret sealed for `eu_acme` under the name `github-token`,
  when it is opened under the same key for `eu_globex`, under the name `gitlab-token`, with its version changed, or with `eu_globex`'s own data key,
  then it throws an `UnreadableUserSecretError`.
