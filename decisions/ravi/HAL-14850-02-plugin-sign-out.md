# Decision: Remove trust and removing a plugin sign out its sign-ins

- Approval: HAL-14850, from Liam's security review of halonic#4276 (PR 5b on HAL-8613); Liam approves this note in his security review
- Kind: user-visible
- Task: HAL-14850

## What changes

The second of two pull requests for HAL-14850, on top of the agent host's sign-out-all (`ravi/HAL-14850-01-sign-out-all`).

- **`PluginService` takes a required `signOut`.** `revoke` (Studio's **Remove trust**, `halonic trust --plugin <id> --remove`) and `remove` (Studio, `halonic plugin remove`) call it first, while the plugin can still read its client secret for the revoke. The trust is then forgotten whether or not the sign-out worked, and a failed sign-out is thrown after that. In `remove` that happens before secrets, settings or the folder go, so removing again finishes the job. A plugin whose entry is a link, or is gone, is still signed out.
- **Studio** passes the agent host's `sign-out-all` route.
- **The CLI** signs out the profile's grants itself, as it runs no refresh of them (`signOutSavedSignIns`): it reads the plugin's own client secret, `plugin__<id>__<secret>`, from its secrets, and the token key only when the plugin has a grant. That adds `@halonicjs/host-integration-sign-in` and `@halonicjs/oauth-sign-in` to the CLI's dependencies, both ours.
- No new wording: the commands and the page say what they said before. A revoke the provider didn't confirm isn't reported yet. That would be new wording, which can come in a follow-up if we want it.

Changed requirements: `app.plugin-remove` (the sign-out comes first) and `studio.desktop-plugins-host` (Remove trust signs out at the agent host). New requirement: `app.plugin-sign-out`, whose examples the core tests and the CLI tests (`apps/cli/src/plugin-sign-out.test.ts`) follow.

## Why

A plugin added later under the same id and with the same sign-in description found itself `signedIn` without the person signing in again, even when it was a different plugin (Liam's security review of halonic#4276). This must land before plugin sign-ins ship in a release. The sign-out runs before the trust goes because the client secret for the revoke is read through the trust. The trust is forgotten even when the sign-out fails, because a sign-out the host couldn't do should never keep a plugin trusted.

## Covers

- app.plugin-remove
- studio.desktop-plugins-host
