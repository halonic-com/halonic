# sandbox-srt.profile-to-srt-config

- Status: active
- Since: 0.1.0
- Source: HAL-193 (plan phase 3, v1.17); Julian's re-review follow-up from HAL-2430

The sandbox-srt adapter shall turn a `SandboxProfile` into the settings of sandbox-runtime so that the program writes only to its working, temp and settings folders, reads nothing the profile denies, reaches only the bridge and the allowed sites, never reaches a loopback, link-local, private or shared address, or one of this computer's own addresses, through an allowed site's name (the bridge's address and port excepted), and never receives a path as a pattern.

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
- Given a profile without a bridge (`null`) and with the allowed site `*.npmjs.org`,
  when the settings are built,
  then the allowed domains are exactly `*.npmjs.org`; with no allowed site, they are empty, which srt reads as no network, and a site that resolves to a loopback address is refused on every port.
- Given the allowed site `*.nip.io`,
  when a name under it resolves to `127.0.0.1`, `169.254.169.254`, `10.0.0.5`, `192.168.1.1`, `100.64.0.1` or `fd00::1`,
  then srt refuses the connection; when it resolves to `127.0.0.1` on the bridge's port, it reaches the bridge.
- Given any profile,
  when the settings are built,
  then a host that isn't allowed is denied without asking.
