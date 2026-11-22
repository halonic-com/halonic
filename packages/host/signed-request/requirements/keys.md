# signed-request.keys

- Status: active
- Since: unreleased
- Source: HAL-13534 (selling layer design, section 8, S2; threat model, section 6)

The format shall read a public key only from its 32 raw bytes in base64url and a private key only from PKCS #8 in base64url, as Ed25519 keys that can't be exported again and can only verify or only sign; and it shall refuse anything else with a reason, never with an error that carries the key's text.

## Examples

- Given an Ed25519 key pair written in those forms,
  when both halves are read,
  then the private half signs, the public half verifies it, and neither can be exported.
- Given a public key of 31 bytes, text that isn't base64url, or a private key that isn't Ed25519,
  when it is read,
  then it is refused with the reason, and the refusal doesn't contain the key's text.
- Given a key id with a space in it,
  when a private key is read under that id,
  then it is refused.
