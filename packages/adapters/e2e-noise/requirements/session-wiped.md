# e2e-noise.session-wiped

- Status: active
- Since: unreleased
- Source: HAL-12236 (B1); Julian's conditions 1 and 6 on HAL-12355

The adapter shall give each session its own WebAssembly instance. When the session ends or fails, its whole
memory shall be zeroed and the instance dropped. The private key and the psk passed in shall be
zeroed once the instance has them.

## Examples

- Given a pairing session run to the end of a rekey,
  when it ends,
  then its memory holds none of the private key, the psk, the handshake hash or a payload.
- Given a session that failed on a message that doesn't decrypt,
  then its memory is zeroed too.
- Given the arrays passed as the private key and the psk,
  when the session starts, or refuses to,
  then they are all zeros.
