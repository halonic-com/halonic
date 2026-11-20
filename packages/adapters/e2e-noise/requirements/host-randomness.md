# e2e-noise.host-randomness

- Status: active
- Since: unreleased
- Source: HAL-12236 (B1); Julian's condition 5 on HAL-12355

The instance shall take its random bytes only from the one function it imports, which fills them
with `crypto.randomFillSync`. A random function that throws shall fail the handshake, never let it
go on with zeros.

## Examples

- Given two sessions with the same keys, then their first handshake messages differ.
- Given a random function that throws, when the initiator writes message 1, then the session
  fails.
