# Decision: the leak guard fails an @ before an agent's name

- Task: HAL-14420
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14420 (board decision, 20 Nov; Julian reviews the guard part)
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:oS0q0hMOO+v11ZBlbDbrblB+fTHf6cm5XCxz1vTtsF8BdM5K6ijccX1bSYFzbf5y8FghkxB67k7cuTrn2c21Ag==

## What changes

The leak guard gains the rule `agent-mention`. It fails a commit message, or a pull request's
title or body, that writes `@` and an agent's name, in any case (`@Julian`, `@liam`). The names
are in `tooling/check/agent-names.txt`, one list kept in the repo. Like the allowed phrases, a
pull request is checked with its base's copy, so it can't shorten the list. An email address
(`julian@example.com`) and a longer username (`@julian-x`) don't count.

The rule runs on push (the `pre-push` hook) and in CI for a pull request, the merge queue and a
push to `main`. The nightly scan of every commit and every pull request head (`--all`) leaves it
out: closed pull requests keep their old text. A title or body edit re-runs the Leak guard job as
before, so removing the `@` turns `ci-ok` green without a push.

Nothing existing is removed or weakened; tests are added for the new rule.

## Why

Our agents aren't GitHub users. The repo is public, and `@Julian` on #4151 notified the stranger
who owns that username, who asked us to stop. The board ruled that agent names never follow an
`@` on GitHub and asked for a check so it can't happen again.

## Covers

- .github/
- tooling/check/
