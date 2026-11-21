# Decision: `halonic trust --remove` in a plugin's folder signs the plugin out

- Approval: HAL-15047, the follow-up Liam decided on HAL-14993; Liam approves this note in his security review
- Kind: user-visible
- Task: HAL-15047

## What changes

`halonic trust --remove` without `--plugin` removes the trust record of the folder it runs in (or `--dir`). When that record is a plugin's (its fingerprint starts with `hpf1:`), it now goes the `--plugin` way: the folder's name is the plugin's id, and `PluginService.revoke` signs the plugin out first and then forgets its trust, also when the sign-out fails. It says what `--plugin <id> --remove` says ("Removed trust for Weather. Nothing from this plugin runs until you trust it.") and gives the same `--json`. A workspace's record is removed as before and signs out nothing.

It goes the `--plugin` way only when the record's folder sits right in this profile's plugins folder (both with links resolved), so `--plugin` reaches the same plugin. A plugin's record anywhere else (the profile folder moved, or `--dir` names a copy of a plugin's folder) is removed by location, as a workspace's is, and signs out nothing: going by the folder's name there would sign out and untrust this profile's plugin with that id and leave the record the person named (Liam's review on HAL-15165).

## Why

Before, the workspace form removed a plugin's record by location and left its grants in `<profile>/integration-sign-ins/tokens`, so a plugin added later under the same id could find itself signed in (`app.plugin-sign-out`).

## Covers

- app.plugin-sign-out
