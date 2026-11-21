# app.plugin-sign-out

- Status: active
- Since: unreleased
- Source: HAL-14850 (Liam's security review of halonic#4276, PR 5b on HAL-8613: a plugin added later under the same id must not find itself signed in); HAL-14993 (Settings › Trusted sources, and a folder deleted by hand)

When a person removes a plugin's trust (Studio's **Remove trust**, `halonic trust --plugin <id> --remove`) or removes the plugin (Studio, `halonic plugin remove`), the app's `PluginService` shall first sign out each of the plugin's sign-ins with the host's sign-out, which revokes each saved grant at the revoke address the person approved, where there is one, and deletes the grant also when the revoke fails. It shall then forget the trust whether or not the sign-out worked, and when it didn't, give the sign-out's error after that, before anything else of the plugin is removed, so that doing it again finishes the job. A plugin whose folder is gone, or whose entry is a link, shall still be signed out. Removing a plugin's record in Studio's Settings › **Trusted sources** shall sign the plugin out the same way first, by its folder's name, and remove the record whether or not the sign-out worked. Adding a plugin without replacing one, when no entry has its id, shall first sign out the sign-ins left for that id, such as by a plugin whose folder was deleted by hand, and a sign-out that fails shall stop the add before anything is written.

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
- Given the trusted weather plugin's record in Settings › Trusted sources,
  when it is removed there,
  then the host signs out `weather` while the record is still there, and afterwards the record is gone, also when the sign-out fails.
- Given the weather plugin's folder was deleted by hand and its grants are left,
  when a plugin with the id `weather` is added,
  then the host signs out `weather` before the plugin is placed; when that fails, nothing is placed.
- Given the weather plugin is there,
  when it is added again without replacing it, or replaced,
  then nothing is signed out.
