# check.release-refuses-1-0-0

- Status: active
- Since: unreleased
- Source: HAL-19109 (the board: Halonic never ships as 1.0.0, the npm placeholder)

When the release workflow starts, if the tag to release, the branch or tag the run started from, or the version in `apps/studio/package.json` names Halonic 1.0.0 or one of its pre-releases, then its first step shall fail with an error that says Halonic never ships as 1.0.0 and to release 1.0.1 or 1.1.0 instead, before anything is built.

## Examples

- Given the tag `v1.0.0`,
  when the release workflow starts,
  then its first step fails and names the tag.
- Given a run started from the branch `release/halonic-1.0.0` with the tag `v0.1.2`,
  when the release workflow starts,
  then its first step fails and names the branch.
- Given the tag `v0.1.2` and `apps/studio/package.json` at `1.0.0`,
  when the release workflow starts,
  then its first step fails and names `apps/studio/package.json`.
- Given the tag `v0.1.1` from `main` with the app at `0.1.1`, or the tags `v1.0.1`, `v1.1.0` and `v11.0.0`,
  when the release workflow starts,
  then the step passes.
