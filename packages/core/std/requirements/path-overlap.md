# std.path-overlap

- Status: active
- Since: unreleased
- Source: HAL-13713 (the rule `system-node.path-overlap` set for HAL-13058, without Node, so the core can use it)

The `absolutePathsOverlap` function shall tell whether one absolute path is on, above or inside another: the same path, a folder holding it, or a path inside it, after `.`, `..` and repeated separators are resolved. It shall compare the paths as Windows reads them on every system, ignoring letter case and taking `/` and `\` both as separators, so it never finds two paths clear that Windows reads as overlapping. A `..` shall never take away a drive, and a `\\server\share` path shall stay one. It shall follow no link and use nothing but the paths it is given.

## Examples

- Given `/person` and `/person/.ssh`,
  when they are compared,
  then they overlap, either way round.
- Given `/person/.ssh-notes` and `/person/.ssh`,
  when they are compared,
  then they don't overlap.
- Given `C:/Work/Acme` and `c:/work/acme/.ssh`, written with either slash,
  when they are compared,
  then they overlap.
