# Decision: the macOS and Windows set runs hourly on main, not on every push

- Task: HAL-15889
- Approval: the board decided it (Timothy, 22 Nov ~06:30 UTC, HAL-15889: "Yes"); Liam signs this note in review
- Kind: internal

## What changes

- **`ci.yml` starts hourly (at :05) and by hand** (`schedule`, `workflow_dispatch`). That run is
  the macOS and Windows set: the jobs that skip in merge groups (HAL-5327) — Tauri on Windows, the
  macOS keychain contract, the Seatbelt, MXC and Windows canary fences, the sandbox packages on
  macOS and Windows, the agent host on macOS and Windows, and the Windows installer and update with
  the WSL runtime the installer needs. The changed-areas step marks every area as changed there,
  so all of them run. Every Linux job skips in it: the merge queue tested that code.
- **It never cancels a run in progress.** The run-level group is the branch
  (`ci-refs/heads/main`, as release branches already had) and only pull requests cancel in
  progress, so a new hourly or manual run waits for the one running. GitHub keeps one waiting run
  per group; a newer one replaces only the one waiting, which never started.
- **A push to `main` no longer starts the macOS and Windows jobs**, and builds the agent host on
  Linux only. They were replaced by the next push's before they finished: 98 of the last 100 push
  runs ended cancelled. Push runs on `release/**` branches and pull requests run them as before.
- **The per-job shared groups go** (`ci-main-<job>`, HAL-15187), and with them ci-ok's check for a
  replaced job: no push to `main` runs those jobs any more. ci-ok is back to its plain form: every
  job passed or was skipped.
- **The nightly reads both runs.** `main-failures` reads the newest finished push run (its Linux
  jobs) and the newest finished hourly or manual run (macOS and Windows) of `ci.yml` on `main` as
  one run, plus `android-screens.yml` as before. A job fails "the second night in a row" against
  the newest run of its kind at least 20 hours older. No hourly run in 3 days: it warns and reads
  the push run alone. The area table gets "WSL runtime" under Adapters; it went to the shared-code
  area before.
- `tooling/check` gets the requirement `check.ci-desktop-hourly` and a test. `check.main-failures`
  now names the hourly run, with an example. `check.ci-main-skips-merged` keeps its rule; one
  example no longer says the macOS and Windows jobs run on a push.

## Why

With about 35 merges an hour a push lands every two minutes, and the macOS and Windows jobs take 15
to 20 minutes on GitHub's runners. So `main` hardly ever finished them (run 44991525799: three
Windows jobs cancelled), and the nightly had little to read. An hourly run on the newest `main`
finishes them, and push runs stop spending GitHub minutes on jobs that get cancelled.

## What it leaves alone

- **Pull requests and merge groups** run exactly as before: their job conditions, matrices and
  concurrency are unchanged. The hourly-run skips match only `schedule` and `workflow_dispatch`.
- **Fail-safe.** If the hourly run doesn't start, nothing else changes: push runs, pull requests
  and the queue don't depend on it, and the nightly warns and reads the push run.
- **Caches.** The hourly run's ref is `refs/heads/main`, so the Rust and pnpm caches the Windows and
  macOS jobs save on `main` are still saved there, now by runs that finish.
- **Our own CI server.** `schedule` and `workflow_dispatch` aren't in `CI_SELF_HOSTED_EVENTS`, and
  the routing expression sends only merge groups and pushes to `main` there, so the hourly run
  stays on GitHub's runners.

## Tests

No test was weakened or skipped. The new test checks the hourly and manual triggers, that no job
has its own concurrency group and only pull requests cancel in progress, that every macOS and
Windows job skips in merge groups and on a push to `main`, that those are exactly the jobs on
macOS or Windows runners, the agent host's three matrices, and that every other job skips in the
hourly run unless its condition already names another event. The nightly's tests add the combined
run and four more job names to the table check.

## Covers

- .github/
- tooling/check/
