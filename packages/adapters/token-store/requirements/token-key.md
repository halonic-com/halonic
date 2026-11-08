# token-store.token-key

- Status: active
- Since: 0.1.0
- Source: HAL-620 (Liam's review on HAL-625)

The token store shall read the key from the configured secret `token-key` only when it has a value to seal or open, shall require exactly 32 bytes in strict base64url, and shall not remember a failed read.

## Examples

- Given no `token-key`,
  when a missing token is read or removed,
  then the store returns without reading the secret.
- Given no `token-key`, or one of the wrong length,
  when a token is set,
  then the error says how to set it and never shows the value.
- Given a failed read,
  when the secret is then set and a token is set again,
  then it works without a restart.
