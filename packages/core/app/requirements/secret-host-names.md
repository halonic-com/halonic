# app.secret-host-names

- Status: active
- Since: unreleased
- Source: HAL-12237 (B2 PR 4), HK1 in C422 (HAL-14560), C580 rows 10, 11 and 14 (HAL-15455)

The app shall refuse, for setting and removing, every name in the ports' `hostSecretNames` (the agent host's own secrets, such as `remote-host-key`), whatever their case or `-` and `_` spelling, with a reason that says what the key is for and that Halonic keeps it itself, fitted to setting or removing, and shall leave those names out of the listing. The store shall be unchanged by a refused name.

## Examples

- Given the name `remote-host-key`,
  when the person sets it,
  then it is refused with `Secret name "remote-host-key" is the key paired phones use to confirm this computer. Halonic keeps it itself, so use another name for a secret of your own.`, and the store is unchanged.
- Given a stored `remote-host-key`,
  when the person removes it,
  then it is refused with `Secret name "remote-host-key" is the key paired phones use to confirm this computer. Halonic keeps it itself, so it can't be removed.`, and the store is unchanged.
- Given the name `Remote_Host_Key`,
  when the person sets it,
  then it is refused and the store is unchanged.
- Given a stored `openai-key` and `remote-host-key`,
  when the person lists the secrets,
  then the only name is `openai-key`.
