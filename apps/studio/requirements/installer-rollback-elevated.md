# studio.installer-rollback-elevated

- Status: active
- Since: unreleased
- Source: HAL-16523 (from the security review of HAL-16342)

When an update that didn't prove it starts would go back to the version before, and Windows raised the installer to administrator rights from an account whose other programs run without them, the Windows installer shall not start the installer kept for the version before, which is in the profile folder that those programs can write. The newer version shall stay, and the installer shall say why in `updates.log`. When it can't read how its rights were raised, it shall treat any administrator rights as raised.

## Examples

- Given the installer template,
  when an update waits for the new version to prove it starts and the wait ends,
  then it asks whether Windows raised it to administrator rights before the rollback guard and before it starts the kept installer, and when it was raised it writes the reason to `updates.log` and returns without starting it.
- Given the installer template,
  when it reads its rights,
  then only a token whose elevation type is "full" counts as raised, and when the token can't be read, any administrator counts as raised.
