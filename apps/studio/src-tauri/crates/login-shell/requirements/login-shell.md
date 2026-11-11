# studio.src-tauri.crates.login-shell.login-shell

- Status: draft
- Since: 0.1.0
- Source: HAL-5545 (code review 11 Nov, line 818)

When the Studio, on macOS or Linux, finds the profile folder and wasn't started with `HALONIC_HOME`, `LOCALAPPDATA` or `XDG_DATA_HOME`, the shell shall read that variable from the person's login shell, started interactive and as a login shell, once per app run, so that the Studio and the CLI in the person's terminal find the same profile. The login shell shall get no input and `HALONIC_RESOLVING_ENVIRONMENT=1`, and shall be stopped when it hasn't printed its environment within five seconds; the app's own variables are then used. What the rc files print themselves shall be ignored.

## Examples

- Given an rc file that prints a greeting and sets `HALONIC_HOME=/srv/from-rc`,
  when the shell reads the login shell's variables,
  then `HALONIC_HOME` is `/srv/from-rc`.
- Given an rc file that unsets `HALONIC_HOME`,
  when the shell reads the login shell's variables,
  then `HALONIC_HOME` isn't among them.
- Given an rc file that never finishes,
  when the shell reads the login shell's variables,
  then the login shell is stopped and nothing is read.
- Given an rc file that sets `HALONIC_HOME=/srv/bg` and leaves a program running in the background,
  when the shell reads the login shell's variables,
  then `HALONIC_HOME` is `/srv/bg`, without waiting for that program.
- Given an rc file that exits before the environment is printed,
  when the shell reads the login shell's variables,
  then nothing is read.
