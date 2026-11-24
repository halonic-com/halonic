# Decision: the scaffold job runs in two legs, the CLI's tasks in a leg of their own, still with no cache

- Task: HAL-17657 (the board's request on the task, 24 Nov: get the job under about 4 minutes
  without losing what it proves, shard or partial cache)
- Approval: Liam signs this note in review (CI workflow, internal CI time, no board card)
- Kind: internal

## What changes

The job "Empty package and feature pass every check" in `.github/workflows/ci.yml` becomes a matrix
with two legs. Both check out, install and generate the same five `ci-example` packages as before.

- `generated`: `pnpm verify --full` with the same `--only` folders and `--also @halonicjs/app-studio`,
  so the repo-wide checks, the generated packages, the Studio app, their dependents and the trace
  check, as before. Only `--also halonic` moves out.
- `cli`: `turbo run typecheck lint test build --filter=...halonic`, the same four tasks
  `--also halonic` gave verify (nothing depends on `halonic`, so it is the one package). On a GitHub
  runner it leaves Vitest its own worker count; on our CI server it keeps 2, as the build job does.

`ci-ok` needs both legs, and the merge-group lookup already counts a job only when every leg
passed. No task, package or check is dropped, and none reads a cache.

## Why

The job took 6.4 to 7 minutes on GitHub's runners and was the slowest job on the pull requests it
ran on. Its time is almost all Turbo (5 min 53 s for 24 tasks, none cached). The slowest task is the
CLI's tests: 279 s in an uncached run of the `apps-host` shard, against 78 s for the Studio app's.
Splitting the CLI out takes the longest task off the other leg's path.

**Why not a partial cache.** The no-cache rule makes sure every task the job lists runs again on the
generated code, rather than replaying a stored result. A cache wouldn't save time here anyway. The new
feature changes the inputs of the root `codegen` task, and typecheck, test and build depend on it, so
every task in scope, the Studio app's and the CLI's included, gets a new hash and misses. On our CI
server a pull request's cache would also be a copy of `main`'s, which adds something to trust and
gains nothing.

**Cost.** One more checkout, install and generate, about 45 s of runner time, on the runs that
run the job at all (a change to `ci.yml`, `.github/actions/` or `tooling/`, for example).

## Covers

- .github/
