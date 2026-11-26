# check.versions-refuse-1-0-0

- Status: active
- Since: unreleased
- Source: HAL-19109 (the board: Halonic never ships as 1.0.0, the npm placeholder)

If the version in `apps/studio/package.json` is 1.0.0 or one of its pre-releases, then the `versions` check shall fail on that file and say to use 1.0.1 or 1.1.0, so a changeset or a hand edit that sets 1.0.0 fails the Version packages pull request before any release.

## Examples

- Given package.json, tauri.conf.json, Cargo.toml and Cargo.lock all at `1.0.0`,
  then the check fails on package.json.
- Given package.json at `1.0.0-rc.1`, then the check fails on package.json.
- Given all four files at `0.1.1`, or all at `1.0.1`, then the check passes.
