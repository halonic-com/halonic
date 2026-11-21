# app.plugin-sign-out

- Status: active
- Since: unreleased
- Source: HAL-14850 (Liam's security review of halonic#4276, PR 5b on HAL-8613: a plugin added later under the same id must not find itself signed in)

When a person removes a plugin's trust (Studio's **Remove trust**, `halonic trust --plugin <id> --remove`) or removes the plugin (Studio, `halonic plugin remove`), the app's `PluginService` shall first sign out each of the plugin's sign-ins with the host's sign-out, which revokes each saved grant at the revoke address the person approved, where there is one, and deletes the grant also when the revoke fails. It shall then forget the trust whether or not the sign-out worked, and when it didn't, give the sign-out's error after that, before anything else of the plugin is removed, so that doing it again finishes the job. A plugin whose folder is gone, or whose entry is a link, shall still be signed out.

## Examples

- Given the trusted weather plugin,
  when its trust is removed,
  then the host signs out `weather` while the trust is still there, and afterwards it isn't trusted.
- Given the trusted weather plugin,
  when it is removed,
  then the host signs out `weather` before its trust, secrets and folder are gone.
- Given a sign-out that fails,
  when the weather plugin's trust is removed,
  then the error is given and the plugin isn't trusted any more; when it is removed instead, its folder, settings and secrets are kept, and removing it again signs it out and finishes.
- Given the weather plugin's entry is a link, or no entry is left,
  when it is removed or its trust is removed,
  then the host still signs out `weather`.
