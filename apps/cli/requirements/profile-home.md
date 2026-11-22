# cli.profile-home

- Status: active
- Since: unreleased
- Source: HAL-15274, from Nina's C554 check (HAL-15255) of #4418; the reason is the profile package's own sentence (`profile.profile-folder`), the fixes decided by Tomas on the task; the lead-ins of `trust --list` and `trust --remove` from Nina's C572 check (HAL-15427); the reason, the `~` fix, the Windows example and the lead-in words from the C576 check (HAL-15429)

When `HALONIC_HOME` is set and isn't a full path, every CLI command that opens the profile folder shall fail with an `invalid_input` error (exit code 2) whose message is the profile package's sentence, `HALONIC_HOME must be a full path, not "<value>".`, rather than an error Halonic can't explain. When the value starts with `~`, as a quoted `export HALONIC_HOME="~/.halonic"` leaves it, the fix shall say that inside quotes the shell doesn't turn `~` into the home folder and to use `$HOME` instead, with `HALONIC_HOME="$HOME/.halonic"` as the example; for any other relative value it shall say to set `HALONIC_HOME` to a full path, such as `$HOME/.halonic`. On Windows, where a user environment variable doesn't expand `$HOME`, the fix shall always say to set a full path, with the person's home folder and `\.halonic` as the example, also for a value that starts with `~`. `halonic trust` shall lead the error with what it was doing: "Couldn't list the trusted workspaces and plugins" for `--list`, "Couldn't remove the trust from <folder or plugin>" for `--remove` ("this folder" before the workspace is read), and "Couldn't trust <folder or plugin>" otherwise. An unset or empty `HALONIC_HOME` shall not be checked here.

## Examples

- Given `HALONIC_HOME` set to `~/.halonic`,
  when `halonic trust --list` runs,
  then it exits with 2 and says "✕ Couldn't list the trusted workspaces and plugins: HALONIC_HOME must be a full path, not "~/.halonic"." and on the next line "Inside quotes the shell doesn't turn ~ into your home folder. Use $HOME instead: HALONIC_HOME="$HOME/.halonic"."
- Given `HALONIC_HOME` set to `~/.halonic`,
  when `halonic trust --dir acme --remove` runs,
  then it says "✕ Couldn't remove the trust from acme:" with the same reason and fix, and `halonic trust --dir acme` says "✕ Couldn't trust acme:".
- Given `HALONIC_HOME` set to `profile`,
  when the CLI opens the profile folder,
  then it fails with the same reason for `profile` and the fix "Set HALONIC_HOME to a full path, such as $HOME/.halonic."
- Given Windows and `HALONIC_HOME` set to `~/.halonic` or `profile`,
  when the CLI opens the profile folder,
  then the fix is "Set HALONIC_HOME to a full path, such as <home folder>\.halonic.", with the person's own home folder in place of `<home folder>`
- Given `HALONIC_HOME` set to a full path, or not set,
  when the CLI opens the profile folder,
  then nothing here refuses it.
