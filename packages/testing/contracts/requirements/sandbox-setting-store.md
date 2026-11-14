# contracts.sandbox-setting-store

- Status: active
- Since: 0.1.0
- Source: each new port gets a contract suite (Liam, HAL-1967); `SandboxSettingStore` port v1; HAL-5392

Where an adapter implements `SandboxSettingStore`, it shall start empty; give back every field of a saved choice, for a backend and for none with its app version; replace a choice saved again, whichever kind it was before; remove a choice, treating the removal of a missing one as no error; keep what was saved whatever the caller later does with the objects it passed or got; refuse to save a choice that isn't valid (an unlisted backend, or a field too many or too few) and keep the one saved before; and, for a choice that can't be read, throw from `get` and never return `null`, while `remove` and `save` still work.

## Examples

- Given an empty store,
  when the choice is read,
  then it is `null`.
- Given a saved choice of `srt` and then a choice of none,
  when the choice is read,
  then it is the choice of none with its app version.
- Given a saved choice of `srt` and a save of `{ backend: "docker" }`,
  then the save throws and the choice is still `srt`.
- Given a damaged choice,
  when it is read,
  then it throws; and when it is removed, the choice reads as `null`.
