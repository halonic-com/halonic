# Decision: no preview installer without a passing click test, and a nightly click test on main

- Approval: the task asks for this change (HAL-18356, PR C of the plan approved on HAL-18317); Liam
  approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TatzeYRsHzi9ofEax99qEmANY13IOkTX3OCXN2caNrVdS7V44UjOQkAQnAua+UhGpMQw22q3SAZSYDbNwSYACg==

## What changes

`.github/workflows/studio-preview.yml`:

- The `halonic-studio-preview-windows` artifact (the setup `.exe` for the board) is no longer
  uploaded by `installer`. `click-test` uploads it in the step right after the click test, with no
  `if:`, so a failing, skipped or unfinished click test keeps no installer artifact. There is no
  override. The header comment says "No installer artifact unless the click test passed on this
  build".
- `halonic-installers-<commit>` stays: it is how the setups reach the click-test runner and how a
  `build-ref` run reuses them (HAL-18353). It is the click test's input, not an installer for
  anyone to try, and the header says so.
- `publish` now takes the setup from `halonic-installers-<commit>`, because the board decided
  publishing doesn't wait for the click test yet (HAL-18477). Its conditions don't change.
- A `nightly` boolean input. A nightly run is named "Nightly click test" (`run-name`; every other
  run keeps GitHub's name) and gets its own concurrency groups, so a merge's waiting build can't
  replace it.

`.github/workflows/scheduled.yml`: the `main-failures` job runs
`tooling/check/src/cli/nightly-click-test.ts --apply` after starting the Android captures. It finds
the commit of the last finished nightly click test and starts one, of `main`'s newest commit as
`build-ref`, only when `apps/studio/`, `apps/agent-host/` or `packages/studio/` changed since, or
there was none. With `build-ref` set, a nightly reuses the push run's installers when there are any,
and never publishes. The job already has `actions: write`; nothing gains a permission.

`tooling/check`: `main-failures.ts` also reads the jobs of the newest nightly click test (for 30
days, since one runs only after a change), and `docs/guides/area-owners.md` gets the Desktop app
area (owner Mateo), with "Click through the installed app" and "Build and start the unsigned Windows
installer" in the CI jobs table, so a failure opens "Failing on main: Desktop app". New requirements
`check.nightly-click-test` and `studio.preview-installer-gate`, with tests. No requirement or test is
edited or removed.

## Why

The board got an installer whose Messenger and engine failed on a real PC (HAL-18311). With this, no
preview installer reaches anyone unless the click test passed on that build, and a break on `main`
in the desktop app reaches its owner the next morning.

## Covers

- .github/
- tooling/check/
