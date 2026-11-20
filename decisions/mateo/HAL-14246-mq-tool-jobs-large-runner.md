# Decision: merge-queue jobs that need Docker, rustup or sudo run on the large runner, not the PC runners

- Task: HAL-14246 (queue outage: HAL-14143, runner variable: HAL-14115)
- Approval: Iris's ask on HAL-14143 (08:55 UTC, 20 Nov) to move these jobs off `halonic-local`; the reviewer approves this note in review
- Kind: internal

## What changes

- In `.github/workflows/ci.yml`, six jobs ask for `large-runner` in a merge group whenever the
  repository variable `MERGE_QUEUE_RUNNER` is set, instead of the runner it names:
  `Secret scan (gitleaks)` (Docker), `Workflow lint (zizmor)` (Python venv),
  `Tauri shell (Rust checks)` (rustup, apt), `Sandbox fence (bubblewrap)` (sudo, apt, AppArmor),
  `Android shell (debug APK)` (rustup, the hosted image's Java and Android SDK) and
  `Studio end-to-end (Playwright)` (sudo, apt).
- Every other merge-group job still reads `MERGE_QUEUE_RUNNER`. Pull requests and pushes are
  unchanged. With the variable unset, everything runs on `ubuntu-24.04` as before.
- The comment at the top of `ci.yml` says why.

## Why

Since about 08:29 UTC on 20 Nov `MERGE_QUEUE_RUNNER` points at the three runners on Timothy's PC
(`halonic-local`). They have no Docker and no rustup: gitleaks fails with
`docker: command not found` and the Rust checks with `rustup: command not found`. One failing job
cancels its group and GitHub rebuilds every group behind it, so nothing has merged since #4168
(07:31) although several groups went green. Only a person can change the repository variable, and
this pull request's own merge group reads its own `ci.yml`, so it can merge without waiting on
that.

When the PC runners get these tools, or the variable goes back to `large-runner`, this routing can
stay or be removed: with `large-runner` in the variable it changes nothing.

## Tests

No test was weakened or skipped. Only which runner six jobs ask for changes; the jobs are the same.

## Covers

- .github/
