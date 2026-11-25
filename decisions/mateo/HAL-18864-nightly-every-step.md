# Decision: the nightly click test runs after any change to what the installed app is built from, compared from the commit it built

- Approval: the task asks for this change (HAL-18864, point 4 of the click-test plan the board
  approved on HAL-18716; HAL-18889, the [minor] finding on #6228); Liam approves and signs this
  note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ShOu9/fsGlycMyOlM0Am8h+sJtgEFFwXPljMsWRqOWSDE0DJ6kt4fJNpgboqe7nh3f6nK1pwzTtT1RQLM4FSBQ==

## What changes

The active requirement `check.nightly-click-test` is edited, and one of its tests is renamed and
changed. Nothing is retired and no test is removed.

- **Which changes start a nightly click test.** It used to start only when `apps/studio/`,
  `apps/agent-host/` or `packages/studio/` changed. The agent host bundles the engine, its adapters
  and the Node target, so a break in `packages/core/engine` shows on the installed app as much as a
  Studio one, yet started no click test. `clickTestPaths` now holds everything the installed app is
  built from (`packages/core/`, `packages/adapters/`, `packages/host/`, `packages/targets/node/`
  added), plus the click test itself, `studio-preview.yml` and `pnpm-lock.yaml`, so a new step or a
  dependency bump gets its night. The test "is skipped when none of the three paths changed" used
  `packages/core/engine/src/run.ts` as a path that doesn't start one; it is now "is skipped when
  nothing the installed app is built from changed", with test-only, Cloudflare-target and CLI
  paths instead, and keeps every check it made. Two new tests cover the added paths and that every
  requirement a click step names lives under them, so a backfill step in a new area (HAL-18716
  point 6) can't go untested at night.
- **Every step.** The requirement now says a nightly click test runs every step, whichever files
  changed. That is true today; it binds the per-build selection of HAL-18863 to leave the nightly
  alone.
- **From the commit it built (HAL-18889).** A nightly run is named `Nightly click test of <commit>`,
  and the script diffs from that commit, not the run's `head_sha`, which is `main`'s tip when the
  run started and can be newer than the build.

## Why

HAL-18716 point 4: a full nightly run of the click test on `main`, whose failure opens "Failing on
main: Desktop app" for the area owner (HAL-12539). The failure report was already in place from
HAL-18356; these changes close the gaps that let a change to the app skip its night.

## Covers

- check.nightly-click-test
- tooling/check/src/lib/nightly-click-test.test.ts
- .github/
- tooling/check/
