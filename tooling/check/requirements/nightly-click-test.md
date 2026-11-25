# check.nightly-click-test

- Status: active
- Since: unreleased
- Source: HAL-18356 (PR C of HAL-18317), HAL-18889, HAL-18864

When the nightly in `scheduled.yml` runs, it shall start a nightly click test of the installed Studio (a run of `studio-preview.yml` of `main`'s newest commit, named "Nightly click test of <commit>") only when there was no earlier one that finished, or a file the installed app is built from changed since the commit the last one built its installer from, as its run name gives it: a file under `apps/studio/`, `apps/agent-host/`, `packages/core/`, `packages/adapters/`, `packages/host/`, `packages/studio/`, `packages/targets/node/` or `packages/testing/studio-click-test/`, or `.github/workflows/studio-preview.yml` or `pnpm-lock.yaml`. Every requirement a click step names shall live under one of those folders. A nightly click test shall run every step of the click test, whichever files changed. `main-failures` shall read the jobs of the newest nightly click test with the other runs on `main`, and report a failed "Click through the installed app" or "Build and start the unsigned Windows installer" job under the Desktop app area of `docs/guides/area-owners.md`.

## Examples

- Given a last nightly click test named "Nightly click test of abc1234", whose run started on a later commit of `main`,
  when the nightly runs,
  then it compares from `abc1234`.
- Given a last nightly click test of a commit, and only `docs/guides/review.md` changed since,
  when the nightly runs,
  then it starts no click test.
- Given a last nightly click test of a commit, and `apps/agent-host/src/main.ts` changed since,
  when the nightly runs,
  then it starts a click test of `main`'s newest commit.
- Given a last nightly click test of a commit, and only `packages/core/engine/src/run.ts` changed since,
  when the nightly runs,
  then it starts a click test of `main`'s newest commit, which runs every step.
- Given a click step that names a requirement under `packages/testing/spec/`,
  then `check`'s own tests fail.
- Given no earlier nightly click test,
  when the nightly runs,
  then it starts one.
- Given a nightly click test whose "Click through the installed app" job failed,
  when `main-failures` runs,
  then it is reported under Desktop app, owner Mateo.
