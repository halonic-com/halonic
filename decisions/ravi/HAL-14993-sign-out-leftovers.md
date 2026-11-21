# Decision: Trusted sources and a newly added plugin also sign out leftover sign-ins

- Approval: HAL-14993, the follow-up from Liam's security review of halonic#4308 (HAL-14850); Liam approves this note in his security review
- Kind: user-visible
- Task: HAL-14993

## What changes

On top of halonic#4308 (`ravi/HAL-14850-02-plugin-sign-out`), the two paths that still left a plugin's grants in `<profile>/integration-sign-ins/tokens`:

- **Settings › Trusted sources › Remove** on a plugin row signs the plugin out first, with the same agent-host sign-out the plugins host uses (`agentHostPluginSignOut`), by the folder's name. Like `PluginService.revoke`, the record is removed whether or not the sign-out worked, and then the sign-out's error is given, so the dialog says why and removing again finishes. A workspace row signs out nothing. It doesn't go through `PluginService.revoke`, because that finds the record through the plugin's folder, and a row whose folder is gone must still lose its trust. `trustedSourcesOf` now takes its parts as one object.
- **`PluginService.add` without `replace`**, when no entry has the plugin's id, signs out what is left for that id before it places the plugin. A sign-out that fails stops the add before anything is written, so adding again tries again. A plugin that is there is never signed out here: placing refuses it as `taken`, and replacing an update keeps its sign-ins. Token names are compared in lower case, but only lower-case ids can have sign-ins, so a `Weather` folder never stands in for `weather`.
- No new wording.

A trust record left by a folder deleted by hand isn't touched: it holds only for a plugin with exactly the same files at the same place.

## Why

So the promise of `app.plugin-sign-out` holds however the old plugin went (Liam's review of halonic#4308). This must land before plugin sign-ins ship in a release.

## Covers

- app.plugin-sign-out
- workspace.trusted-sources
