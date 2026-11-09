# check.spec-snapshot

- Status: active
- Since: 0.1.0
- Source: HAL-1664

When `pnpm version:sync` runs, it shall copy each spec file `<package>/spec/<name>.schema.json` to `<package>/spec/released/<version>/<name>.schema.json` if the file differs from its newest released copy or has none yet, and leave every other spec file without a new copy. `<version>` is the owning package's `version`, or the app version in `apps/studio/package.json` for a package without one. The newest copy is the one with the highest semver version, where a pre-release comes before its release. If a spec file was already released at that version with other text, then it shall write no file and fail, because a released spec never changes.

## Examples

- Given `spec/agent.schema.json` with no released copy, when the sync runs for `0.1.0`, then it writes `spec/released/0.1.0/agent.schema.json` with the same text.
- Given a spec equal to its copy in `released/0.1.0/`, when the sync runs for `0.2.0`, then it writes nothing for that spec.
- Given a spec that differs from its copy in `released/0.1.0/`, when the sync runs for `0.2.0`, then it writes `released/0.2.0/` with the new text.
- Given copies in `released/0.2.0-rc.1/` and `released/0.2.0/`, when the newest copy is chosen, then it is `0.2.0`; between `0.9.0` and `0.10.0` it is `0.10.0`.
- Given a spec that differs from its copy in `released/0.2.0/`, when the sync runs for `0.2.0`, then it fails and writes nothing.
