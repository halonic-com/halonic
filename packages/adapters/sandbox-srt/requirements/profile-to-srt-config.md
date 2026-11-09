# sandbox-srt.profile-to-srt-config

- Status: active
- Since: 0.1.0
- Source: HAL-193 (plan phase 3, v1.17)

The sandbox-srt adapter shall turn a `SandboxProfile` into the settings of sandbox-runtime so that the program writes only to its working, temp and settings folders, reads nothing the profile denies, reaches only the bridge and the allowed sites, and never receives a path as a pattern.

## Examples

- Given a profile with a working folder, a temp folder and no settings folder,
  when the settings are built,
  then writes are allowed in those two folders only.
- Given a denied path that contains a `*`,
  when the settings are built,
  then the path is passed as a literal path, not a pattern.
- Given a bridge on `127.0.0.1:4100` and the allowed site `*.npmjs.org`,
  when the settings are built,
  then the allowed domains are exactly `127.0.0.1:4100` and `*.npmjs.org`.
