# studio.src-tauri.lite-check

- Status: draft
- Since: unreleased
- Source: HAL-13408, HAL-8005; HAL-15963 (a relative `HALONIC_HOME`); design HAL-7986 (`first-run-progress`, section 3.2)

When the page calls `lite_check`, the shell shall run, without Node and without the agent host, the checks the window can do on its own, and answer them as a list of `{ id, fact }` in this order: `app_files`, `present` when the agent host's executable, and on Windows `halonic-sandbox-elevate.exe` and `srt-win.exe`, are files with content beside the app, else `missing`; `profile_writable`, `writable` when it can make the CLI's profile folder if it isn't there and make and remove a probe file in it, `not_writable` when it can't, `halonic_home_relative` with `message`, the CLI's sentence and fix, when `HALONIC_HOME` isn't a full path, and `no_profile` when the profile can't be found for any other reason; `disk_space`, `enough` from 1 GiB free on the profile's drive, `low` below that, with `freeBytes`, or `unknown` when it can't be read. On Windows it shall add `wsl_distro`, `present` or `missing` as `wsl.exe` lists Halonic's distro, `wsl_missing` when there is no `wsl.exe`, `unknown` when it fails or hasn't listed the distros within 20 seconds; and `wsl_runtime`, `present` when the updater's `status` names a current runtime, `missing` when it names none, `unknown` when it fails, and `not_checked` when the distro isn't there. The answer shall hold only these ids, facts, the free bytes and that one `message`, never a path, a name or an error message otherwise. The command shall take nothing from the page, never fail as a whole, and be granted to the app's own local main window on desktop only, never to the Studio the computer serves.

## Examples

- Given an app folder without the agent host's executable,
  when the page calls `lite_check`,
  then `app_files` is `missing`.
- Given a profile folder that is a file,
  when the page calls `lite_check`,
  then `profile_writable` is `not_writable`.
- Given `HALONIC_HOME="~/.halonic"`,
  when the page calls `lite_check`,
  then `profile_writable` is `halonic_home_relative`, with the sentence that says `HALONIC_HOME` must be a full path and how to set it.
- Given 900 MiB free on the profile's drive,
  when the page calls `lite_check`,
  then `disk_space` is `low` with that many `freeBytes`.
- Given Windows without Halonic's distro,
  when the page calls `lite_check`,
  then `wsl_distro` is `missing` and `wsl_runtime` is `not_checked`.
