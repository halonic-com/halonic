# Decision: the security reviewer's key is pinned for `internal` and `user-visible` decision notes

- Task: HAL-11671
- Approval: HAL-11668, option 1 extended to `internal`; carries out AGENTS.md "Requirements and tests" (neither Liam nor Julian signs a pull request they wrote, the other one signs)
- Kind: internal

## What changes

`tooling/check/approvers.json` lists the security reviewer's key under both `"internal"` and `"user-visible"`, copied exactly from the `"guardians"` entry (same `id`, `holder` and `publicKey`). Nothing else in the file changes. `docs/guides/checks.md` now says both keys approve those kinds.

## Why

AGENTS.md says neither Liam nor Julian signs a pull request they wrote, and the other signs. The file pinned only the CTO's key for those two kinds, so a note on a pull request Liam wrote could not be approved at all. That blocks #3328 and #3331, where Julian's signature fails with "key isn't in the merge base's approvers.json".

## What it widens

Julian's signature alone can now approve an `internal` or `user-visible` note, including the guard's non-trust-root paths that the CTO's signature already covers. Trust roots (this file included) still need two different guardians' signatures, and a pull request can't add its own key because the guard reads `approvers.json` from the base branch. This is a trust-root change, so it needs both guardians' signatures.

## Tests

No test was changed, weakened or skipped.

## Covers

- tooling/check/approvers.json
