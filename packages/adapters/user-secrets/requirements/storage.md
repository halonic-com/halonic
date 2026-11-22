# user-secrets.storage

- Status: active
- Since: unreleased
- Source: HAL-16242, split from HAL-13223 (end-user secrets in the selling layer design, HAL-12483)

The user secrets package shall describe `UserSecretStorage`, where one end user's wrapped data key and sealed secrets are kept, with an in-memory version, and shall export `UserSecrets`, which stores, reads, lists the names of and removes one end user's secrets by their `secretKey` form. `UserSecrets` shall hand the storage only the wrapped data key and sealed values, never a value in the clear, shall make the user's data key on the first stored secret and keep only one even when two first writes run at once, and shall refuse a bad name or an empty value with a `RangeError` before it stores anything.

## Examples

- Given `github-token` stored for `eu_acme`,
  when `GITHUB_TOKEN` is read,
  then the value comes back, and the names are `["GITHUB_TOKEN"]`.
- Given a stored secret,
  when everything in the storage is serialized,
  then it contains the value neither as text nor as base64.
- Given two secrets stored at once for a new user,
  then the storage holds one data key, and both secrets open.
- Given `eu_acme`'s storage,
  when `UserSecrets` for `eu_globex` reads a secret from it,
  then it throws an `UnreadableUserSecretError`.
