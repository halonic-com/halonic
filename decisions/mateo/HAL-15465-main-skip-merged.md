# Decision: a push to main skips the server jobs its merge group already passed

- Task: HAL-15465
- Approval: the board decided it (21 Nov ~22:50 UTC, HAL-15465: "Yes"); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:YbnpqiDRF+AwcT9vAScmOaT7J6mnr1xWFfcpageve25gSzPFOxb8hta8ecrzs+SplWzImmIoLVPYLeZr6H6fDg==

## What changes

- **A new `merged` job** ("Merge group already passed this commit"), on pushes to `main` only, on
  `ubuntu-24.04`. It asks the API for a green merge-group run of `ci.yml` whose `head_sha` is the
  pushed commit and whose `ci-ok` passed, and lists the jobs that passed there: `fast`, `build`
  (every shard), `trace` (only with `build`, because it reads the build's test results), and
  `scaffold`, `e2e` and `docs` when the group ran them. The run log names the merge-group run it
  matched.
- **Those jobs skip on the push** when the list names them. They now need `merged` and run with
  `!cancelled()`, because `merged` is skipped on pull requests and merge groups; there the list is
  empty and every job runs exactly as before.
- **Fails open.** No such run (a bypass merge, a direct push, a group that failed or got lost), an
  API or `jq` error, a re-run (attempt 2 or later) or the repo variable `CI_MAIN_SKIP_MERGED` set to
  `off`: the list is empty and every job runs. `merged` always exits 0 and isn't in `ci-ok`'s needs,
  so the lookup can never turn `main` red.
- **Still runs on every push:** the macOS and Windows jobs (they skip in merge groups, HAL-5327),
  the GitHub-hosted Linux jobs (Leak guard, gitleaks, zizmor, Tauri, sandbox fence, Android, agent
  host), and any server job the merge group skipped by area, so a gap in the area rules still shows
  on `main`.
- `tooling/check` gets the requirement `check.ci-main-skips-merged` and a test; the routing test
  lists `merged` with the jobs that stay on GitHub's runner.

## Why

Since 22:18 UTC merge groups run on our CI server. With squash merges the commit that lands on
`main` is the exact commit its merge group tested, so the push run tested the same tree again on the
same 8 large slots. On the last full push run that was about 20 minutes of large-slot time (`fast`
47 s, the eight shards about 15 minutes, `scaffold` and `e2e` about 4), and its shards waited 8 to
13 minutes for a slot.

## What it leaves alone

- **Caches.** pnpm's store on our server is the server's own disk; on GitHub's runners the
  GitHub-hosted jobs above still save it on `main`. The Rust cache is saved by the Tauri job, which
  still runs. The Turbo remote cache's shared area is written only by `main` pushes; merge groups
  write only their own `q/` area (HAL-14149), which the queue reads first, so the queue stays warm.
  Merge groups are *not* trusted writers of the shared area, and this change doesn't make them one.
  What gets staler: the shared area and the GitHub-cache copy of Turbo's local cache that pull
  requests restore, both refreshed only by a full push run. Pull requests run on GitHub's runners,
  so that costs them time, not our server's slots.
- **Coverage floors and the merge base's tests** don't read push runs' jobs. The merge base's
  walk-back looks for a push run with conclusion `success`; a push run with skipped jobs still
  concludes `success`.
- **The nightly "Failures on main, by area"** reads the newest push run's jobs and counts only
  failures. A skipped job is not a failure, and the macOS and Windows jobs it exists for still run.

## Tests

No test was weakened or skipped. The new test checks that only the six listed jobs depend on the
lookup, that each runs unless the lookup names it, that the lookup runs only on a push to `main`
and never fails, and that its name map matches each job's `name:`.

## Covers

- .github/
- tooling/check/
