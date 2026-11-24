# Decision: `pnpm decision sign` signs for pull requests into a release branch

- Task: HAL-17599 (blocks the 0.1.1 release, HAL-16760)
- Approval: Liam wrote it; Mateo checks it on HAL-17599 and Julian signs as the security reviewer
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:/pzzvQ7iQ3Wgi85YKkSKyrti1klwJ8kkcL8ksllfEwSMdSX+ZZ6VQSiqOeUuuWar5ifr6GCXUuSh6W4JVrZrDw==

## What changes

`pnpm decision sign` used to refuse every pull request whose base isn't `main`. Now it also signs for a pull request into a release branch (`release/<name>`, letters, digits, `.`, `_` and `-` only, no `..`). For such a base it fetches that branch and reads its `approvers.json` and notes, as it does for `main`. It still runs only from a clean worktree of `origin/main`, and still refuses every other base. How the note check verifies a signature doesn't change. No trust root changes: the rule is in `cli/decision-base.ts`, and the note check doesn't import `cli/decision.ts`.

## Why

The note check (`guard-notes.yml`) already runs on pull requests into `release/**`, but nobody could sign a note for them. #5665, a 3-line `.github/` fix into `release/halonic-0.1.1` that the board chose for the 0.1.1 release, failed the note check, and Julian's `decision sign` refused it. Signing a release-branch note gives a signer no power they don't already have on `main`: the same keys, pinned on the base branch.

## Covers

- tooling/check/
- check.decision-sign-release-base
