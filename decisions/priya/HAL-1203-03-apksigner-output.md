# Decision: the Play signature check reads the newer apksigner output

- Approval: the CTO (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:RmhbcaEnbICpFS09U4RelGSg83K+ICv/fnVEsvZqgAAYkZbtdExmbgbJM/PkCPRqWcc7HnqwrntI/I/VOTHgCw==
- Task: HAL-1203

## What changes

In `.github/workflows/android-play.yml`, the "Check the APK's signature" step reads the signer
digest from both apksigner formats: `Signer #N certificate SHA-256 digest:` (older) and
`V3.0 Signer: certificate SHA-256 digest:` (newer). Other signer lines (V3.2 hybrid, source stamp)
are not read. It also fails with its own message when no digest is found, instead of comparing an
empty value.

## Why

The first draft upload (run 43284321384) reached Play and the APK carried the right app signing
key, but the check found no digest because it only knew the older format. The check still fails the
release on any mismatch. Nothing is weakened.

## Covers

- .github/
