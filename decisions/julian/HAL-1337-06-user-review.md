# Decision: the user approves a user-visible note with a GitHub review, and the guard's trust roots need it

- Approval: the board decided this on [HAL-3434](/HAL/issues/HAL-3434) on 12 Nov: option A, a GitHub review from the user's own account (`timothykorse`, pinned by numeric ID). It is built in [HAL-1337](/HAL/issues/HAL-1337). This pull request needs the user's own approving review on GitHub.
- Kind: user-visible

A `user-visible` note carries no signature. It is approved when the account that `approvers.json` pins under `github` has an approving review on the pull request's latest commit, read live through the run's read-only token. A push, a dismissal or a later request for changes withdraws it, and a missing token or a GitHub error counts as not approved. The user is pinned in `approvers.json` by numeric GitHub user ID, as the board confirmed. The CTO's `internal` note stays enough for routine changes to `.github/`, `tooling/check/` and `.gitattributes` (about 45 commits a day, so the user's review would hold up the team; decided by Liam on HAL-7701), but not for `approvers.json`, `guard-notes.yml`, `tooling/check/src/guard/` or the two guard commands, which need the user. The `extraExports` carve-out stays. There is deliberately no `pull_request_review` trigger: GitHub would run it from the pull request's own copy of the workflow, which could report success. After the approval, re-run the job. `check.guard-user-review` is new; `check.guard-signed-notes` and `check.guard-notes-own-paths` say so.

## Covers

- .github/
- tooling/check/
- tooling/check/approvers.json
- check.guard-signed-notes
- check.guard-notes-own-paths
