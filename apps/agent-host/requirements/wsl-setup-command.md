# agent-host.wsl-setup-command

- Status: active
- Since: unreleased
- Source: HAL-16770, HAL-16765 (scope, PR 1); `sandbox-srt.wsl-setup`, `sandbox-srt.wsl-runtime-by-shell`, `agent-host.wsl-remove-route`

When Studio's shell runs the agent host on Windows with `--wsl-setup`, the agent host shall run the WSL setup (`sandbox-srt.wsl-setup`) without serving, with the image from `--wsl-image`, the `RunOnce` command from `--wsl-resume`, the distro folder `Halonic\wsl\halonic` under its own `LOCALAPPDATA`, the setup state saved in its profile folder (the state the removal reads, `agent-host.wsl-remove-route`) and the runtime left to the shell (`sandbox-srt.wsl-runtime-by-shell`). It shall print the result as one JSON line and exit with 0 only when the outcome is `done`, and with 1 otherwise. It shall refuse without running any step, printing `{"outcome":"refused","code","detail"}`, when it runs with `--wsl-shared-folders` (`in-distro`), when it doesn't run on Windows (`not-windows`), and when `--profile-folder` isn't an absolute path without a `..` part, `--wsl-resume` doesn't start with a quoted absolute path on a drive, or `--wsl-image` or `LOCALAPPDATA` isn't an absolute path on a drive without a `..` part (`bad-flags`). Anything the setup throws (a saved state that can't be read or saved, a program it can't start, a `RunOnce` key it can't set) shall end as `{"outcome":"error","detail"}`, never as an empty state or a step reported as done.

## Examples

- Given Windows with WSL and no distro called `halonic`,
  when the shell runs `--wsl-setup --profile-folder <profile> --wsl-image <image> --wsl-resume <command>`,
  then the distro is imported from `<image>` into `<LOCALAPPDATA>\Halonic\wsl\halonic`, the profile's state records Halonic's import as `done`, the host prints `{"outcome":"done","residuals":[…],"runtime":"left-to-shell"}` and exits with 0.
- Given Windows without WSL, where the install asks for a restart,
  when the shell runs `--wsl-setup`,
  then the host prints `{"outcome":"restart-needed"}`, `RunOnce` holds `<command>`, and it exits with 1.
- Given the host runs with `--wsl-shared-folders`, or on Linux,
  when it runs `--wsl-setup`,
  then it prints `refused` with `in-distro` or `not-windows`, exits with 1, and no WSL step ran.
- Given `--wsl-image image.tar.gz` (a relative path), `--profile-folder profile`, or `--wsl-resume "Halonic.exe --resume"` (a program that isn't a quoted drive path),
  then it prints `refused` with `bad-flags`.
- Given Windows without WSL, where `reg.exe` can't set `RunOnce`,
  when the shell runs `--wsl-setup`,
  then it prints `error` with the failure in `detail`, exits with 1, and WSL isn't installed.
- Given a profile whose `sandbox/wsl-setup.json` isn't a valid state,
  then it prints `error`, exits with 1, and nothing was imported.
