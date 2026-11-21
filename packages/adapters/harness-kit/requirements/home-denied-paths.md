# harness-kit.home-denied-paths

- Status: active
- Since: unreleased
- Source: HAL-12343; Liam's review of halonic#4226 (a credential folder made during a plugin's local tool session)

When a host builds the denied paths of a plugin's local tool, the harness kit shall give every path in the person's home folder that the denied list names, whether or not it is there yet, each at the real place of the deepest folder on its way that is there. A path that isn't there yet shall be denied by name, so a sandbox that denies by name keeps a folder made during the session out too. The denied groups that a harness run's `sandbox.opened` event names shall still leave out a path that isn't there.

Known limit (Linux): srt mounts nothing over a path that isn't there, and can't without writing into the home folder, which Halonic doesn't do. So on Linux a credential folder the person makes while a local tool's session runs can be read by that session until it ends, at most one session (`runnerTimeLimitMs`, 10 minutes) of a plugin the person trusted; srt still holds its network to the declared hosts. The next session denies it, as the host looks the denied paths up again for each session (`connector-stdio-sandbox.plugin-local-tool-denied-paths`). Liam accepted this limit in his review of halonic#4304.

## Examples

- Given a home folder with `.ssh` and no `.aws` or `.config`,
  when a host builds a local tool's denied paths,
  then they hold `.ssh`, `.aws` and `.config/gcloud` in the home folder's real place.
- Given the same home folder,
  when a harness run names its denied groups,
  then only `ssh-keys` is named, with `.ssh` alone.
