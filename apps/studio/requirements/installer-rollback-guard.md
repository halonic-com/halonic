# studio.installer-rollback-guard

- Status: active
- Since: unreleased
- Source: HAL-5404 (S3 from the HAL-5407 review; design with Owen on HAL-14806)

When the Windows installer would put a version on the computer whose srt needs an older Windows setup version than the agent sandbox on the computer was set up with, it shall not do so. An update that didn't prove it starts shall stay on the newer version, and say why in `updates.log`, instead of going back to the version before. An older installer shall stop before any page, with a message when it has pages and exit code 2 when it is silent or passive. The installer shall read the computer's setup version from srt's machine key (`MarkerVersion`, which `srt-win user status` reports as `marker_version`) and shall run no program from the install folder for it, with or without administrator rights. Every installer shall keep, beside its kept copy, the setup version its own srt needs; a kept installer without that record counts as setup version 3. When the setup version can't be read, an update shall stay on the newer version, and an installer shall go on and say so in `updates.log`.

## Examples

- Given srt's machine key with `MarkerVersion` 4 and an installer whose srt needs 3,
  when the guard runs,
  then it exits 1, and with `MarkerVersion` 3, 2 or no key at all it exits 0.
- Given a `MarkerVersion` that isn't a whole number, or no setup version to compare,
  when the guard runs,
  then it exits 2.
- Given a kept installer with no `.srt-setup` record,
  when the guard reads its setup version,
  then it reads 3.
- Given the installer template,
  when an update waits for the new version to prove it starts,
  then it runs the guard with the version before's record just before it goes back, and goes back only when the guard exits 0.
- Given the installer template,
  when it starts,
  then it runs the guard with its own setup version and quits with exit code 2 when the guard exits 1.
- Given the build script,
  when the setup version in `packages/adapters/sandbox-srt/windows-setup-version.json` isn't a whole number above zero,
  then it stops before it packs the installer.
