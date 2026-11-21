# cli.profile-home

- Status: active
- Since: unreleased
- Source: HAL-15274, from Nina's C554 check (HAL-15255) of #4418; the reason is the profile package's own sentence (`profile.profile-folder`), the fixes decided by Tomas on the task

When `HALONIC_HOME` is set and isn't an absolute folder, every CLI command that opens the profile folder shall fail with an `invalid_input` error (exit code 2) whose message is the profile package's sentence, `HALONIC_HOME must be an absolute folder, not "<value>".`, rather than an error Halonic can't explain. When the value starts with `~`, as a quoted `export HALONIC_HOME="~/.halonic"` leaves it, the fix shall say to use `$HOME` instead of `~`, which the shell leaves as it is inside quotes, with `HALONIC_HOME="$HOME/.halonic"` as the example; for any other relative value it shall say to set `HALONIC_HOME` to a full path, such as `$HOME/.halonic`. On Windows the example shall be `$HOME\.halonic`. An unset or empty `HALONIC_HOME` shall not be checked here.

## Examples

- Given `HALONIC_HOME` set to `~/.halonic`,
  when `halonic trust --list` runs,
  then it exits with 2 and says "✕ Couldn't trust this folder: HALONIC_HOME must be an absolute folder, not "~/.halonic"." and on the next line "Use $HOME instead of ~, which the shell leaves as it is inside quotes: HALONIC_HOME="$HOME/.halonic"."
- Given `HALONIC_HOME` set to `profile`,
  when the CLI opens the profile folder,
  then it fails with the same reason for `profile` and the fix "Set HALONIC_HOME to a full path, such as $HOME/.halonic."
- Given `HALONIC_HOME` set to an absolute folder, or not set,
  when the CLI opens the profile folder,
  then nothing here refuses it.
