# e2e-noise.published-vectors

- Status: active
- Since: unreleased
- Source: HAL-12236 (B1); Julian's test plan on HAL-12355

A session shall write and read every message of the published Noise vectors for
`Noise_XXpsk3_25519_ChaChaPoly_SHA256` and `Noise_IK_25519_ChaChaPoly_SHA256` byte for byte, through
`noise.wasm`, and give the vectors' handshake hash.

## Examples

- Given each vector in the crate's `tests/vectors.json`, with its keys, prologue and psk, and its
  ephemeral keys as the random bytes,
  when the initiator and the responder exchange its messages,
  then every message equals the vector's, every payload reads back, and both handshake hashes equal
  the vector's.
