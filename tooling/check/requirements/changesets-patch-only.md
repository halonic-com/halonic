# check.changesets-patch-only

- Status: active
- Since: unreleased
- Source: HAL-14730

If a changeset in `.changeset/` asks for a bigger version step than the rule's `maxBump` setting (`minor` while 0.2.0 is released, `patch` otherwise), then the `changesets` check shall fail, name the file and line, and say to use the setting until a bigger release is approved. The setting is raised to `minor` for the 0.2.0 release the board approved on HAL-17109, and goes back to `patch` after it merges. It is raised only when the board approves a minor release on a release card.

## Examples

- Given a changeset that names `"@halonicjs/app-studio": patch`, then the check passes.
- Given a changeset that names `"@halonicjs/app-studio": major`,
  then the check fails on that line, names the file and says to use `minor` until a major release is approved.
