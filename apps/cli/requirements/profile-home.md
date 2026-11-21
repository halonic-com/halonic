# cli.profile-home

- Status: active
- Since: unreleased
- Source: HAL-15274, from Nina's C554 check (HAL-15255) of #4418; HAL-15429, from the C576 check (HAL-15424) of #4579; the reason is the profile package's own sentence (`profile.profile-folder`), the fixes decided by Tomas on the tasks

When `HALONIC_HOME` is set and isn't an absolute folder, every CLI command that opens the profile folder shall fail with an `invalid_input` error (exit code 2) whose message is the profile package's sentence, `HALONIC_HOME must be a full path, not "<value>".`, rather than an error Halonic can't explain. When the value starts with `~`, as a quoted `export HALONIC_HOME="~/.halonic"` leaves it, the fix shall say that inside quotes the shell doesn't turn `~` into your home folder and to use `$HOME` instead, with `HALONIC_HOME="$HOME/.halonic"` as the example; for any other relative value it shall say to set `HALONIC_HOME` to a full path, such as `$HOME/.halonic`. On Windows, where `HALONIC_HOME` is a user environment variable and nothing turns `$HOME` into the home folder, the fix shall say to set it to a full path for any value, `~` included, with `.halonic` in the person's own home folder as the example. An unset or empty `HALONIC_HOME` shall not be checked here.

## Examples

- Given `HALONIC_HOME` set to `~/.halonic`,
  when `halonic trust --list` runs,
  then it exits with 2 and says "✕ Couldn't list the trusted workspaces: HALONIC_HOME must be a full path, not "~/.halonic"." and on the next line "Inside quotes the shell doesn't turn ~ into your home folder. Use $HOME instead: HALONIC_HOME="$HOME/.halonic"."
- Given `HALONIC_HOME` set to `profile`,
  when the CLI opens the profile folder,
  then it fails with the same reason for `profile` and the fix "Set HALONIC_HOME to a full path, such as $HOME/.halonic."
- Given Windows, the home folder `C:\Users\acme` and `HALONIC_HOME` set to `~\.halonic` or `profile`, <!-- leak-guard: allow absolute-path made-up example path -->
  when the CLI opens the profile folder,
  then the fix is "Set HALONIC_HOME to a full path, such as C:\Users\acme\.halonic." <!-- leak-guard: allow absolute-path made-up example path -->
- Given `HALONIC_HOME` set to an absolute folder, or not set,
  when the CLI opens the profile folder,
  then nothing here refuses it.
