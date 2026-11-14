# Decision: the Play signature check also pins the V3.2 hybrid signer

- Approval: the CTO (Liam) approves this note in review
- Kind: internal
- Task: HAL-8801

## What changes

In `.github/workflows/android-play.yml`, the "Check the APK's signature" step now also checks the
V3.2 hybrid signer of the Play-signed APK. When the APK has one, its classical and its PQC
certificate digests must equal two new repo variables,
`PLAY_APP_SIGNING_V32_CLASSICAL_CERT_SHA256` and `PLAY_APP_SIGNING_V32_PQC_CERT_SHA256`. A missing
variable fails the release, the same as a mismatch. An APK without a V3.2 signer is checked as
before (V3.0 only).

## Why

Android 37 and later verify the V3.2 hybrid signer, not the V3.0 one, and it uses different
certificates. Before this change, nothing pinned them, so a release could carry a V3.2 signer that
no check looked at. Both V3.2 certificates are pinned (not only the classical one) because a
hybrid signature is only as strong as both halves being the keys we expect.

## Before the first release uses it

The V3.2 keys must be confirmed as Play-managed in the Play Console's app signing page, and the two
variables set from there. The digests in run 43284321384 are only a starting point to compare
with: they come from the same APK being checked, so they prove nothing on their own. Until the
variables are set, a release with a V3.2 signer fails at this step, on purpose.

## Covers

- .github/
