# e2e-noise.same-as-snow

- Status: active
- Since: unreleased
- Source: HAL-12236 (B1); Julian's test plan on HAL-12355

The `noise.wasm` module shall produce, for our prologue and a psk from a pairing code, exactly the
bytes plain `snow` produces natively, as the phone runs it: both handshakes, transport messages both ways and a
rekey of each direction.

## Examples

- Given the transcript in `src/test/transcript.json`, which the crate's native test checks
  against plain `snow`,
  when the session plays either side of it,
  then every message it writes equals the transcript's, every message it reads gives the
  transcript's payload, and the handshake hash and the check code are the transcript's.
