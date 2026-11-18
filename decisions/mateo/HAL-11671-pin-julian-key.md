# Decision: the security reviewer's key is pinned for `internal` and `user-visible` decision notes

- Task: HAL-11671
- Approval: HAL-11668, option 1 extended to `internal`; carries out AGENTS.md "Requirements and tests" (neither Liam nor Julian signs a pull request they wrote, the other one signs)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:DJnklUwdmw8a7fCHLsbUnRssqgbxPSKdXOcOvh3G35n48xuAks3E68gH4TSTa2NcHpxtSQOqLrRSMiGytxuPCw==

## What changes

`tooling/check/approvers.json` lists the security reviewer's key under both `"internal"` and `"user-visible"`, copied exactly from the `"guardians"` entry (same `id`, `holder` and `publicKey`). Nothing else in the file changes. `docs/guides/checks.md` now says both keys approve those kinds.

Kind is `user-visible` because the guard requires it for any change under `tooling/check/`; the note covers `tooling/check/`.

## Why

AGENTS.md says neither Liam nor Julian signs a pull request they wrote, and the other signs. The file pinned only the CTO's key for those two kinds, so a note on a pull request Liam wrote could not be approved at all. That blocks #3328 and #3331, where Julian's signature fails with "key isn't in the merge base's approvers.json".

## What it widens

Julian's signature alone can now approve an `internal` or `user-visible` note, including the guard's non-trust-root paths that the CTO's signature already covers. Trust roots (this file included) still need two different guardians' signatures, and a pull request can't add its own key because the guard reads `approvers.json` from the base branch. This is a trust-root change, so it needs both guardians' signatures.

## Tests

No test was changed, weakened or skipped.

## Covers

- tooling/check/
- tooling/check/approvers.json
