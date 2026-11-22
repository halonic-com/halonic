# user-secrets.envelope

- Status: active
- Since: unreleased
- Source: HAL-16242, split from HAL-13223 (end-user secrets in the selling layer design, HAL-12483)

The user secrets package shall read the deployment's key-encryption key from the secret `user-secrets-key` (32 bytes in base64url) and import it so it can't be exported, and shall refuse a missing or malformed key with an error that never repeats the value. It shall make each end user's data key from 32 random bytes, keep it only as a non-extractable AES-256-GCM key, and store it only wrapped by the key-encryption key, with that key's id. It shall seal every secret with the data key under a new random 96-bit nonce, and shall throw an `UnreadableUserSecretError`, which names the secret but never its value, when a stored data key or secret is damaged or in an unknown format. When a data key was wrapped with a different key-encryption key, the error shall say so.

## Examples

- Given a data key made for `eu_acme`,
  when a secret is sealed with it and opened with the same key unwrapped again,
  then the value comes back, and the sealed text doesn't contain it.
- Given two data keys made for the same user, or one value sealed twice,
  then the wrapped keys differ, and so do the sealed values.
- Given a wrapped data key and a different key-encryption key,
  when it is unwrapped,
  then the error says it was wrapped with a different key-encryption key.
- Given a sealed secret with a missing part, an unknown format or a damaged value,
  when it is opened,
  then it throws an `UnreadableUserSecretError` that names the secret.
