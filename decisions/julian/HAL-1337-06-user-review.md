# Decision: the user approves a user-visible note with a GitHub review, and the guard's trust roots need it

- Approval: Liam decided this on [HAL-7701](/HAL/issues/HAL-7701), under the interim rule from [HAL-5221](/HAL/issues/HAL-5221); the board approved the GitHub review itself on [HAL-3434](/HAL/issues/HAL-3434), and this pull request needs the user's own approving review on GitHub before it merges
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5EvNfPyJgAgnZOviOG6uDuC5sF65fbVkD15GfAYI4wBmPfDD55tqNRcGhl95Fj3RRbztA7aY3Zc01mT1c2SiCw==

The board decided on [HAL-3434](/HAL/issues/HAL-3434) on 12 Nov: option A, a GitHub review from the user's own account (`timothykorse`, pinned by numeric ID). It is built in [HAL-1337](/HAL/issues/HAL-1337).

A `user-visible` note carries no signature. It is approved when the pinned account has an approving review on the pull request's latest commit, read live through the run's read-only token. A push, a dismissal or a later request for changes withdraws it, and a missing token or a GitHub error counts as not approved. The account is pinned by numeric GitHub user ID as a constant in `tooling/check/src/guard/reviews.ts`, not in `approvers.json`. That folder, the two guard commands and the `lib/` helpers they import now need the user's review to change, so the pin is as protected as `approvers.json` would be. The CTO's `internal` note stays enough for routine changes to `.github/`, `tooling/check/` and `.gitattributes` (about 45 commits a day; decided by Liam on HAL-7701). `check.guard-user-review` is new; `check.guard-signed-notes` and `check.guard-notes-own-paths` say so. There is deliberately no `pull_request_review` trigger: GitHub would run it from the pull request's own copy of the workflow, which could report success. After the approval, re-run the job.

**Why this note is `internal`, and the gate that stays.** This is the pull request that teaches the guard to read GitHub reviews, so it has to pass the guard that `main` runs today, which can't. Everything it touches is under `.github/` or `tooling/check/`, where `main`'s interim cover allows a CTO-signed `internal` note. The board's gate stays: the merge captain (Liam) merges only after the user has approved this exact head commit on GitHub, and checks that by hand, because this one pull request can't check it itself. From the next pull request on, the guard enforces it.

## Covers

- .github/
- tooling/check/
- check.guard-signed-notes
- check.guard-notes-own-paths
