# app.secret-host-names

- Status: active
- Since: unreleased
- Source: HAL-12237 (B2 PR 4), HK1 in C422 (HAL-14560)

The app shall refuse, for setting and removing, every name in the ports' `hostSecretNames` (the agent host's own secrets, such as `remote-host-key`), whatever their case or `-` and `_` spelling, with a reason that says the name belongs to Halonic's agent host, and shall leave those names out of the listing. The store shall be unchanged by a refused name.

## Examples

- Given the name `remote-host-key`,
  when the person sets or removes it,
  then it is refused with a reason that names Halonic's agent host, and the store is unchanged.
- Given the name `Remote_Host_Key`,
  when the person sets it,
  then it is refused and the store is unchanged.
- Given a stored `openai-key` and `remote-host-key`,
  when the person lists the secrets,
  then the only name is `openai-key`.
