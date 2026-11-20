# agent-host.remote-host-key

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 10 (HAL-12232); task HAL-12237; ADR "Pairing and the end-to-end session"

The agent host shall keep its static X25519 key, the one phones pin, through the secrets port, under the name `remote-host-key`, which is one of the host's own secret names that no workspace may read. On first use it shall make a new key and save it, once even when two first uses come at the same time; after that it shall give the saved key. If the saved value isn't a 32-byte key in base64url, then it shall refuse it with an error that doesn't repeat the value, and shall not replace it, because a new key would make every paired phone see "Can't confirm your computer". It shall give its private key as a new copy each time, so a Noise session can zero the copy it takes.

## Examples

- Given no saved key,
  when the host key is loaded twice,
  then a key is made and saved once, and both loads give the same key.
- Given no saved key,
  when the host's one loader is asked twice at the same time,
  then one key is made and saved, and both get it.
- Given the saved private key of RFC 7748's first test vector,
  when the host key is loaded,
  then its public key is that vector's public key.
- Given a saved value that is too short,
  when the host key is loaded,
  then it fails without the value in its message, and the saved value is unchanged.
