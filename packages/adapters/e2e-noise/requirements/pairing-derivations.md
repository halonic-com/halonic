# e2e-noise.pairing-derivations

- Status: active
- Since: unreleased
- Source: HAL-12236 (B1); ADR "Pairing and the end-to-end session"

The psk, the check code and the phone's commitment shall be computed with `node:crypto` from the
codecs in `@halonicjs/ports`: the psk and the check code shall match every case of
`pairing-vectors.json`, and comparisons of anything derived from the code shall be constant time.

## Examples

- Given each pairing code vector, then `pairingPsk` gives its psk.
- Given each check code vector, then `checkCode` gives its check code.
- Given a phone key and a payload, then `pairCommit` is the SHA-256 of `pairCommitInput`, in
  base64url without padding.
