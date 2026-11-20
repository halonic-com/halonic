# system-node.path-overlap

- Status: active
- Since: unreleased
- Source: HAL-13058 (one rule for a readable folder near a hidden one, shared by `sandbox-srt` and the plugin local tool's place)

The `pathsOverlap` function shall tell whether one path is on, above or inside another: the same path, a folder holding it, or a path inside it, after `.` and `..` are resolved. It shall compare the paths as Windows reads them on every system, ignoring letter case and taking `/` and `\` both as separators, so it never finds two paths clear that Windows reads as overlapping. The `bothSpellings` function shall give a path as written and with every link and junction on the way resolved, also when the end of the path doesn't exist yet, each spelling once. The resolved spelling shall be the one the system itself reports, with Windows short names such as `RUNNER~1` expanded, so it matches a folder's real location as the file system gives it.

## Examples

- Given `/person` and `/person/.ssh`,
  when they are compared,
  then they overlap, either way round.
- Given `/person/.ssh-notes` and `/person/.ssh`,
  when they are compared,
  then they don't overlap.
- Given a path through a link to another folder,
  when both its spellings are asked for,
  then the path as given and the path in the folder the link points to come back.
