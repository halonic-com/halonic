# Decision: a push to main starts the hourly macOS and Windows run when GitHub's scheduler drops it

- Task: HAL-15889
- Approval: follows the board's decision on HAL-15889 (22 Nov ~06:30 UTC: "Yes"); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:C4G33Vta9aaNatnji4KfIo3DOdqSVLOGWfJWxL6tCvvNsvrIrM5c3eg61ei5BVlOTV5XZAQbqToMVGocltIYCQ==

## What changes

- **New workflow `desktop-hourly.yml`, on every push to `main`.** One job, about 10 seconds on
  `ubuntu-24.04`, with `actions: write` and nothing checked out. It reads the newest scheduled and
  the newest manual `ci.yml` run on `main`. If neither started in the last 60 minutes and neither
  is waiting or running, it starts `ci.yml` on `main` with `workflow_dispatch`, which is the macOS
  and Windows set from the first note (HAL-15889-hourly-desktop-run).
- **One push asks at a time** (`desktop-hourly-start`, never cancelled in progress), so two pushes
  a second apart don't both start a run. A newer push replaces only the one waiting; GitHub shows
  that replaced run of this small workflow as cancelled. `ci.yml` runs are not affected.
- `ci.yml`'s hourly cron stays. When GitHub does run it, the next push sees it and starts nothing.
- `check.ci-desktop-hourly` names the new workflow and gets an example; its test checks the trigger,
  the group, the permission, the one-hour lookup and the start.

## Why

GitHub's scheduler started none of `ci.yml`'s hourly slots on 22 Nov (09:05, 10:05 and 11:05 never
ran, with the workflow active and the cron on `main`). Other crons here run hours late as well:
Live cloud's `41 */6` ran at 07:25 and 09:54. GitHub documents that scheduled runs can be delayed
or dropped under load. A push lands on `main` every few minutes, so a push is a reliable clock.
A Paperclip routine that starts the run every hour would cost a seat run each hour and has no
GitHub identity outside a task (HAL-2499).

## What it leaves alone

- **Pull requests, merge groups and release branches** never run the new workflow.
- **Fail-safe.** If the lookup or the start fails, the job warns and passes; nothing waits on it.
- **Token.** It uses the workflow's own token with `actions: write` only, which can start
  workflows in this repo and nothing else. GitHub lets that token start a `workflow_dispatch` run.

## Tests

No test was weakened or skipped. One test is added to `ci-desktop-hourly.test.ts`. The lookup was
tried by hand against the live repo on 22 Nov 11:36 UTC: no scheduled run, the newest manual run
from 09:35, so it would start one.

## Covers

- .github/
- tooling/check/
- check.ci-desktop-hourly
