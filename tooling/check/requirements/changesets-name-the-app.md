# check.changesets-name-the-app

- Status: active
- Since: unreleased
- Source: HAL-14675

If a changeset in `.changeset/` names a package other than `@halonicjs/app-studio` in its front matter, then the `changesets` check shall fail, name the file and line, and say to name `@halonicjs/app-studio` instead.

## Examples

- Given a changeset that names `"@halonicjs/app-studio": patch`, then the check passes.
- Given a changeset that names `"halonic": patch`,
  then the check fails on that line and says to name `@halonicjs/app-studio`.
- Given a changeset that names the app and `@halonicjs/engine`,
  then the check fails on the engine's line only.
- Given a changeset with empty front matter, then the check passes.
- Given `.changeset/README.md`, then the check doesn't read it.
