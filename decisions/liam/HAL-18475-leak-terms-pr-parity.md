# Decision: the pull request's leak guard catches what the merge queue's catches

- Approval: the task asks for this change (HAL-18475); Liam wrote it, so Julian reviews and signs this note
- Kind: internal

## What changes

- `leak-terms.yml` also checks the login and display name of the account that opened the pull request, as `pull request author` (terms only, never printed). It reads the name from the account's public profile into a copy of the event, not through `env:`.
- CI's `Leak guard` job on a pull request into `main` or `release/*` reads the newest `Personal terms (base branch's code)` result for the head and fails when it failed. With no finished result after about 5 minutes it passes with a warning; the merge queue still checks the terms. The job gets `checks: read` for this.
- `readPullRequestText` returns the opener (`author`); nothing else reads it.

No rule is weakened and no test changes: one test is added.

## Why

Two pull requests passed the leak guard on the pull request and failed it in the merge queue (HAL-18424, 4 failed and 5 cancelled group runs). The queue's squash commit is authored by the opener, and the queue checks commit authors; the pull request never saw that author. And a red `Leak terms` run didn't count anywhere, because it isn't part of `ci-ok`.

## Tests

`tooling/check/src/cli/leaks.test.ts`: "fails a term in the login or name of the pull request's opener, and never prints it". The workflow step was checked by hand against real heads (a failed and a passed `Leak terms` run).

## Covers

- .github/
- tooling/check/
