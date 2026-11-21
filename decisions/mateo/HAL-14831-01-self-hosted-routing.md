# Decision: ci.yml can send merge groups and pushes to main to our own CI server, switched off until the variables are set

- Task: HAL-14831 (plan revision 2, Julian's security verdict "approved with changes", the board's note of 21 Nov that the runners are built)
- Approval: the board decided to run our own CI on the new server (Timothy, 21 Nov, HAL-14831); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MUABUECCeo8q8XleI06HIMFHDEAOiTjzA1H7YDmPIP5FbKBKvS3U64H8388CuJ9o2tnAsGAil1D3D21nQPdiAw==

## What changes

- In `.github/workflows/ci.yml`, eight Linux jobs get one routing expression as their `runs-on`:
  `build`, `e2e` and `scaffold` for the large runner (`CI_RUNNER_LARGE`), and `changes`, `fast`,
  `trace`, `policy-base` and `docs` for the small one (`CI_RUNNER_SMALL`). A job goes to our own
  server only when its variable is set, the event is listed in `CI_SELF_HOSTED_EVENTS`, and the
  event is a merge group or a push to `main`. Pull requests, `release/**` pushes and every other
  event stay on `ubuntu-24.04` whatever the variables say. All three variables are empty, so
  nothing changes for any run when this merges.
- `leaks` (the only job with the leak guard's secret, Julian's C3), `gitleaks` (runs Docker, which
  the server's image doesn't have) and `zizmor` (needs a Python venv, which the image doesn't have)
  stay on `ubuntu-24.04`, as do every job the plan keeps on GitHub.
- The `MERGE_QUEUE_RUNNER` switch (HAL-14115) is removed from `ci.yml` and `built-on-label.yml`.
  It was never set, so those jobs keep running on `ubuntu-24.04`. `guard-notes.yml` keeps its copy
  for now: it's a trust root, and the dead expression there does nothing while the variable is unset.
- On our own server, the e2e job doesn't run `apt-install` (the image has no sudo, and has
  Playwright's Linux libraries preinstalled). Instead it checks that every library Playwright asks
  for is installed and names any that's missing, so a Playwright update that needs a new one says
  "rebuild the image" instead of failing in a test.
- The setup action skips GitHub's pnpm-store cache on our own server, where pnpm uses the store
  the runner image points it at.
- Each moved job ends with a step, only on our own server, that writes the job's `memory.peak` and
  `cpu.stat` to the job summary (the new `runner-usage` action), for sizing the slots in the shadow
  week.
- `tooling/check` gets the requirement `check.ci-self-hosted-routing` and a test that every moved
  job uses the exact expression, that no other job names the server, and that the old switch is gone.

## Why

The board wants merge groups faster and decided to run them on our own server, for our own work
only. The routing isn't the security boundary: a fork's pull request runs its own copy of
`ci.yml`, so the runner image's hook refuses every job that isn't one of ours (reviewed separately
in the `infra/ci-runner/` pull request, against Julian's C1–C6). The routing only keeps our own
pull requests and release branches on GitHub's runners, and gives one off switch: clear
`CI_RUNNER_LARGE` and `CI_RUNNER_SMALL` and every job is back on `ubuntu-24.04` on its next run.

## Tests

No test was weakened or skipped. One requirement and its four tests are new.

## Covers

- .github/
- tooling/check/
