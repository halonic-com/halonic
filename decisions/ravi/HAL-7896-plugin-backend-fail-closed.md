# Decision: a plugin backend's start fails closed and runs only the checked files

- Approval: a change to an active requirement needs Liam's review (requirement guard); Liam approves this note in review of the fail-closed pull request on HAL-7896
- Kind: internal
- Task: HAL-7896

## What changes

- `PluginBackendStart` refuses any trust status other than `trusted`. A status added later
  refuses the start instead of counting as trusted.
- `start` hands the plugin, its location, its files with their hashes and its fingerprint,
  as checked, to the start, so the start does not read the folder again.
- A declared secret without a stored name is an error naming the plugin and the secret
  (`PluginSecretNameMissingError`, catalogue key `plugin-secret-name-missing`), not a fallback
  to the declared name.
- The requirement `app.plugin-backend` says all three, and states that the gate decides
  again at each start where the code may run.

## Why

Before, the check had no default branch, so a new trust status would have fallen through as
trusted. It also hashed the files and dropped them, so a change to the folder between the check
and the start ran code the person had not trusted. A fallback to the bare secret name would
have stored or read a secret under a name nobody chose; a bug should be loud.

## Covers

- app.plugin-backend
