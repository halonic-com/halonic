# events.sandbox-opened

- Status: active
- Since: 0.1.0
- Source: board approval of proposal 1 ("What this run can do") in the `proposals` document on HAL-1601, with Julian's conditions on HAL-1673; task HAL-1707; the facts for the sandbox screens on HAL-1782 and the UX checklist on HAL-1833

The run log shall have a `sandbox.opened` event, written when a sandboxed step starts, with the step's `state`, its `agent` and a display copy of its sandbox profile in `sandbox`, so a finished run still shows what the step could do. The events package shall make that copy with `sandboxOpenedView(profile, options)` from a fixed list of fields: the sandbox's strength, the working folder, the read-only paths, the denied paths, the allowed sites and the time limit. It shall never copy the profile's `env`, its temp folder, its settings folder or any field not on that list: the screens show none of them. The groups of denied paths shall be the six in `deniedPathGroupCodes`: `ssh-keys`, `cloud-sign-ins`, `browser-data`, `password-stores`, `halonic-data` and `agent-settings`. Denied paths shall be logged as the codes of the groups that have paths and whose paths are all denied, plus the other denied paths one by one: the ones the person added. Paths in the person's home folder shall start with `~`. The event holds codes and paths, never sentences; screens word them through the message catalogue. `readSandboxOpened(value)` shall read a stored `sandbox` without throwing: it gives the view with only the listed fields, or `null` when the value is damaged or a field is missing, so a screen can say it couldn't read it.

## Examples

- Given a profile with `env` set and a field not on the list,
  when its view is made,
  then the view has neither, nor any of their values.
- Given a profile with a temp folder and a settings folder,
  when its view is made,
  then neither path is in the view.
- Given a profile whose denied paths are the SSH keys group, the cloud sign-ins group and one path the person added,
  when its view is made,
  then `deniedGroups` is the two group codes and `deniedPaths` is the person's path.
- Given a group of which only some paths are denied,
  when the view is made,
  then the group is not named and its denied paths are listed one by one.
- Given a group with no paths, such as one that doesn't apply on this platform,
  when the view is made,
  then the group is not named.
- Given the home folder `<home>` and the working folder `<home>/work`,
  when the view is made,
  then the working folder is `~/work`, and a folder next to the home folder whose name starts the same, `<home>name`, stays as it is.
- Given the event types of the run log,
  when they are listed,
  then `sandbox.opened` is among them, with `state`, `agent` and `sandbox`.
- Given a stored `sandbox` that is damaged, has a field missing or names a group not in `deniedPathGroupCodes`,
  when it is read with `readSandboxOpened`,
  then the result is `null` and nothing is thrown.
- Given a stored `sandbox` with an extra field,
  when it is read with `readSandboxOpened`,
  then the result has only the listed fields.
