# check.changesets-patch-only

- Status: active
- Since: unreleased
- Source: HAL-14730

If a changeset in `.changeset/` asks for a bigger version step than the rule's `maxBump` setting (`patch`), then the `changesets` check shall fail, name the file and line, and say to use `patch` until a bigger release is approved. The setting is raised only when the board approves a minor release on a release card.

## Examples

- Given a changeset that names `"@halonicjs/app-studio": patch`, then the check passes.
- Given a changeset that names `"@halonicjs/app-studio": minor`,
  then the check fails on that line, names the file and says to use `patch` until a minor release is approved.
- Given a changeset that names `"@halonicjs/app-studio": major`, then the check fails on that line.
