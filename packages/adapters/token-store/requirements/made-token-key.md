# token-store.made-token-key

- Status: active
- Since: unreleased
- Source: HAL-13855 (Liam's option 2 on HAL-13854: Halonic makes the token key itself, so nobody makes one by hand)

The `madeTokenKey` function shall give the secrets a token store reads `token-key` from, and make the key the first time it is read while there is none. It shall read `token-key` from the secrets it is given first (the environment, then the profile's secrets file), and a key found there shall always be used and nothing written, so a key someone already set, such as `HALONIC_SECRET_TOKEN_KEY`, is never replaced. Without one, it shall make 32 bytes from the system's cryptographic generator, in base64url, and store them with the store's `setIfMissing`, so of two programs that make a key at the same moment both use the one stored first and neither overwrites it. It shall make no key while any of the token stores it is given holds a token, and throw `TokenKeyMissingError` (kind `conflict`) instead, because a new key couldn't open those tokens. It shall read every other name from the secrets as it is. No message, error or log line shall hold a key.

## Examples

- Given a fresh profile,
  when a token is sealed,
  then a 32-byte key in base64url is stored as `token-key`, and a second token store over the same profile opens the token.
- Given a stored `token-key`,
  when a token is sealed,
  then that key is used and nothing is written.
- Given `HALONIC_SECRET_TOKEN_KEY` and no stored key,
  when a token is sealed,
  then the environment's key is used and no key is stored.
- Given two token stores over one fresh profile,
  when both seal a token at the same moment,
  then one key is stored and both tokens open with it.
- Given no key but a sealed token in one of the token stores,
  when a token is read or sealed,
  then it throws `TokenKeyMissingError`, whose message says the key is missing and never holds a value, and no key is stored.
- Given a profile whose only token was removed,
  when a token is sealed,
  then a key is made.
