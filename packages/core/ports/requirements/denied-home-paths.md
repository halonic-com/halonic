# ports.denied-home-paths

- Status: active
- Since: unreleased
- Source: HAL-13713; threat model 4.6 (the paths a harness run's sandbox denies in the home folder)

The ports package shall keep the one list of the paths a harness run's sandbox denies in a person's home folder, by denied group (every group of `deniedPathGroupCodes` except `halonic-data`), with the paths every system has and the ones only Linux, macOS or Windows has, so the sandbox's profile and a plugin's copy use the same list. It shall say whether a `/` separated path relative to any folder is or lies in one of those paths at any depth, for every system's list, comparing names as Windows and macOS open them, and shall not count a folder that is only on the way to one.

## Examples

- Given `.ssh/id_ed25519`, `keys/.aws/credentials`, `x/.config/gcloud`, `.npmrc`, `.SSH`, `.ssh.` or `AppData/Roaming/gcloud/a.db`,
  when it is checked,
  then it is denied.
- Given `.config`, `.config/app.json`, `.sshrc`, `notes/ssh` or `gcloud`,
  when it is checked,
  then it isn't denied.
- Given the Linux list and the Windows list,
  when the paths of the `browser-data` group are read,
  then Linux has `.mozilla` and Windows has `AppData/Roaming/Mozilla`, and each has only its own.
