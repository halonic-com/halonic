# harness-kit.home-denied-paths

- Status: active
- Since: unreleased
- Source: HAL-12343; Liam's review of halonic#4226 (a credential folder made during a plugin's local tool session)

When a host builds the denied paths of a plugin's local tool, the harness kit shall give every path in the person's home folder that the denied list names, whether or not it is there yet, each at the real place of the deepest folder on its way that is there. A path that isn't there yet shall be denied by name, so a sandbox that denies by name keeps a folder made during the session out too. The denied groups that a harness run's `sandbox.opened` event names shall still leave out a path that isn't there.

## Examples

- Given a home folder with `.ssh` and no `.aws` or `.config`,
  when a host builds a local tool's denied paths,
  then they hold `.ssh`, `.aws` and `.config/gcloud` in the home folder's real place.
- Given the same home folder,
  when a harness run names its denied groups,
  then only `ssh-keys` is named, with `.ssh` alone.
