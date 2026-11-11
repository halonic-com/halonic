# Decision: the requirement guard compares with the commit the pull request was built on, and blocks

- Task: HAL-5568 (follow-up to HAL-5221)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-5568](/HAL/issues/HAL-5568)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hpftvBSEn67ujoKERJIu1WXDkWDuFl0hlynZMYhVjNlyphXJ9ahRodneeFORsztmPDcHLW8tNOLvZOOCq1rRDQ==

## What changes

In `.github/workflows/ci.yml`, the "Merge base's tests" job now switches to the first parent of the checked-out merge ref (the main commit the pull request was merged into) instead of `git merge-base pull_request.base.sha HEAD`. The guard job's base side is that commit, so it compares the merge ref with the main commit it was built on and sees only the pull request's own changes. Without a merge commit it falls back to the merge base. The "Requirement guard" step loses `continue-on-error`, so a finding now fails `ci-ok`. `docs/guides/checks.md` says the guard blocks. `tooling/check` gets a requirement (`check.guard-base-is-built-on-commit`) and a test that builds a real branch, moves main on, and checks the base is main's new commit and the guard reports nothing.

The fewer-`expect`-calls rule in `tooling/check/src/guard/test-runs.ts` now only fires when the pull request changes a file in the package that owns the requirement's tests, or the requirement file. `docs/guides/checks.md` and the requirement `check.guard-fewer-assertions` say so, and `guard-test-runs.test.ts` covers both sides (nothing changed in the package with a lower count: no finding; an edited test file, an edited helper in the package or an edited requirement file with fewer calls: finding).

## Why


`pull_request.base.sha` is older than main once main moves on, while the checked-out head is the newest merge. Any pull request behind main got a finding for every active requirement main changed since (on #1751 at `64fd7d0`: `shell.palette-dialog` and `shell.window-title`). That made the guard unusable as a blocking check.

Once it blocked, CI showed a second source of false findings: the `expect` counts of `cli.commands.routines.watch` (221 vs 232) and `sandbox-srt.check` (31 vs 37) differ between runs with no code change in those packages (polling tests, environment-dependent skips). The count is measured at run time, so a test can also be weakened through a shared helper, a fixture or the code under test; the rule therefore fires on any change in the owning package. A lower count in a package the pull request didn't touch is noise, and the rule ignores it. The other guard rules are unchanged.

## Why the note covers three requirements

The guard runs the merge base's copy of its own code, so on this pull request the old fewer-`expect`-calls rule still runs. It flags `cli.commands.routines.watch` (222 against 227) and `sandbox-srt.check`, which this pull request doesn't touch, and it flags the edit of `check.guard-fewer-assertions`. The note covers these three so this pull request can merge; after it, the new rule runs on every pull request and ignores the run-to-run drop.

## Tests

No test was skipped. One guard test changed on purpose: the "fewer expect calls" test now edits the test file too, because that is when the rule fires; new tests cover a changed requirement file, a changed helper with an unchanged test file, and an untouched package with a lower count. `guard-base.test.ts` runs the workflow's own switch step against a real git history, and runs the guard with main's new commit as the base (nothing reported) and with the older commit (the finding that used to appear). The decision note's signature is still checked against `pull_request.base.sha`, as before.

## Covers

- .github/
- tooling/check/
- check.guard-fewer-assertions
- cli.commands.routines.watch
- sandbox-srt.check
