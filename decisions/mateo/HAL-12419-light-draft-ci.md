# Decision: a draft pull request gets a light CI run

- Approval: the task asks for this change (HAL-12419); Liam approves this note in review
- Kind: internal

## What changes

In `.github/workflows/ci.yml`, CI also starts when a pull request is marked ready for review. The
`Changed areas` job gets a `full` output, `false` on a draft pull request and `true` everywhere
else. These jobs run only when it is `true`: the merge base's tests, the requirement guard, the
scaffold check, Tauri on Windows, the macOS keychain contract, the Seatbelt, MXC and Windows sandbox
fences, the sandbox packages on macOS and Windows, the agent host executable, the Windows installer
and update, Android and Studio's end-to-end tests. A draft still runs the fast gates, the leak
guard, gitleaks, zizmor, the policy rules, the coverage floors, the build with its tests and the
Linux Tauri and bubblewrap jobs, and `ci-ok`. The merge queue and `main` run every job as before.

## Why

The hosted runners are shared with the merge queue. Since 08:00 UTC on 18 Nov the queue's build job
has waited 6 to 22 minutes for one, and a whole merge-group run took 25 to 60 minutes instead of 3
to 20 (HAL-12419). 53 of the 85 open pull requests are drafts, and they used 1,855 of the 3,834 CI
job-minutes since 07:00. Almost two thirds of those (63%) went to the jobs that now wait until a
draft is marked ready.

## Tests

No test was weakened or skipped: every job still runs on a pull request before it can be queued
(marking it ready starts the full run), in the merge queue and on `main`.

## Covers

- .github/
