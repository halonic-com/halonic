# Decision: the requirement guard compares with the commit the pull request was built on, and blocks

- Task: HAL-5568 (follow-up to HAL-5221)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-5568](/HAL/issues/HAL-5568)
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, the "Merge base's tests" job now switches to the first parent of the checked-out merge ref (the main commit the pull request was merged into) instead of `git merge-base pull_request.base.sha HEAD`. The guard job's base side is that commit, so it compares the merge ref with the main commit it was built on and sees only the pull request's own changes. Without a merge commit it falls back to the merge base. The "Requirement guard" step loses `continue-on-error`, so a finding now fails `ci-ok`. `docs/guides/checks.md` says the guard blocks. `tooling/check` gets a requirement (`check.guard-base-is-built-on-commit`) and a test that builds a real branch, moves main on, and checks the base is main's new commit and the guard reports nothing.

## Why

`pull_request.base.sha` is older than main once main moves on, while the checked-out head is the newest merge. Any pull request behind main got a finding for every active requirement main changed since (on #1751 at `64fd7d0`: `shell.palette-dialog` and `shell.window-title`). That made the guard unusable as a blocking check.

## Tests

No test was weakened or skipped. `guard-base.test.ts` runs the workflow's own switch step against a real git history, and runs the guard with main's new commit as the base (nothing reported) and with the older commit (the finding that used to appear). The decision note's signature is still checked against `pull_request.base.sha`, as before.

## Covers

- .github/
- tooling/check/
