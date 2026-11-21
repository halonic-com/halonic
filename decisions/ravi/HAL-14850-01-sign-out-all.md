# Decision: the agent host signs out all of an integration's sign-ins

- Approval: HAL-14850, from Liam's security review of halonic#4276 (PR 5b on HAL-8613); Liam approves this note in his security review
- Kind: internal
- Task: HAL-14850

## What changes

The first of two pull requests for HAL-14850. This one gives the agent host a way to sign out every saved sign-in of an integration. The second one makes Remove trust and removing a plugin call it, in Studio and the CLI.

- **The host finds a plugin's grants from the grants themselves**, never from its sheet: the token store's records list their names without the token key (`storedTokenNames`), and `signInsInTokenNames` reads an integration's sign-ins back from them, the way back from `signInTokenName`. So a grant is found when the plugin isn't trusted any more, its folder is gone or its sheet no longer has the sign-in.
- **`SignInHost.signOutAll`** signs out each one through the integration's parts, so it waits for a refresh in flight, and then drops the parts, so a pending sign-in ends. `POST /v1/integrations/sign-in/sign-out-all` serves it to Studio. Its body takes any name up to 128 characters, because a plugin's id may hold `.` or `_`: a name that isn't a sheet name has no grant and signs out nothing. The route is added to the client's and the Tauri shell's route lists.
- **A sign-out always removes the grant.** A client secret that can't be read, which is what a plugin that lost its trust gives, now counts as missing (`notConfirmed`) instead of failing the sign-out. A grant that can't be opened, such as without the token key, is removed without a revoke (`notConfirmed`).
- **The host keeps no parts for a plugin the trust doesn't cover** (the optional point of the review): a request refused as `plugin_not_trusted` drops them (`SignInHost.forget`).
- **`signOutSavedSignIns`** does the same sign-out for a process that runs no refresh, over https only. The CLI uses it in the second pull request.

Changed requirements:

- `oauth-sign-in.sign-out`: the grant is also removed when the client secret can't be read or the grant can't be opened.
- `oauth-sign-in.sign-in-token-name`: the way back from token names to an integration's sign-ins.
- `agent-host.integration-sign-in-routes`: the sign-out-all route, and dropping the parts on `plugin_not_trusted`.
- `agent-host-client.integration-sign-in`: `signOutAll`.

New requirements: `token-store.stored-names` and `integration-sign-in.sign-out-all`.

## Why

Before this change, a plugin's grants outlived its trust and the plugin itself. A plugin added later under the same id and with the same sign-in description found itself `signedIn` without the person signing in again, even when it was a different plugin. The host can't use the sheet to find the grants, because the sheet is exactly what can no longer be read or trusted at that point. Removing the grant even when the revoke can't be sent is what Liam asked for: a revoke that fails still deletes the grant.

## Covers

- oauth-sign-in.sign-out
- oauth-sign-in.sign-in-token-name
- agent-host.integration-sign-in-routes
- agent-host-client.integration-sign-in
- apps/studio/src-tauri/crates/agent-host/src/routes.rs
