# check.nightly-click-test

- Status: active
- Since: unreleased
- Source: HAL-18356 (PR C of HAL-18317)

When the nightly in `scheduled.yml` runs, it shall start a nightly click test of the installed Studio (a run of `studio-preview.yml` named "Nightly click test", of `main`'s newest commit) only when there was no earlier one that finished, or a file under `apps/studio/`, `apps/agent-host/` or `packages/studio/` changed since the commit of the last one. `main-failures` shall read the jobs of the newest nightly click test with the other runs on `main`, and report a failed "Click through the installed app" or "Build and start the unsigned Windows installer" job under the Desktop app area of `docs/guides/area-owners.md`.

## Examples

- Given a last nightly click test of a commit, and only `docs/guides/review.md` changed since,
  when the nightly runs,
  then it starts no click test.
- Given a last nightly click test of a commit, and `apps/agent-host/src/main.ts` changed since,
  when the nightly runs,
  then it starts a click test of `main`'s newest commit.
- Given no earlier nightly click test,
  when the nightly runs,
  then it starts one.
- Given a nightly click test whose "Click through the installed app" job failed,
  when `main-failures` runs,
  then it is reported under Desktop app, owner Mateo.
