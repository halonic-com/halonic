# sandbox-srt.wsl-setup

- Status: active
- Since: unreleased
- Source: HAL-5394, HAL-3779 (sections 5.2 and 5.4), HAL-5407 (W6, W8, W11)

The sandbox-srt adapter shall set up Halonic's WSL 2 distro for the `srt-wsl` backend on Windows as a saved state machine (`not-started`, `installing-wsl`, `restart-needed`, `importing-distro`, `checking`, `installing-runtime`, `done`; the runtime step is `sandbox-srt.wsl-runtime`), saving the step before it starts and resuming at the saved step. It shall install WSL itself only when it is missing, with `wsl --install --no-distribution --web-download` and one administrator prompt, and put a `RunOnce` entry for the user in place before the prompt so the setup continues after the restart; it shall take the entry out again when the setup is done, cancelled or blocked. After an install that needs a restart it shall wait until Windows' start time has changed. It shall import the distro (`wsl --import`, no administrator) only when no distro of that name is registered. Before and during the steps it shall say, as codes from the port's list, why WSL can't be had: `not-supported` (Windows older than build 19041), `blocked-by-policy` (the `AllowWSL` policy is 0), `virtualisation-off`, `wsl-missing`, `restart-needed` and `distro-missing`, read from the Windows build, the policy key, `wsl --status`, the install's own output and exit code, and the distro list. It shall never read or write `.wslconfig`. (W8) It shall refuse a distro called `halonic` that it didn't record as its own import, with the failure `distro-not-ours`, and change nothing. (W11) In the `checking` step it shall read the WSL kernel version (`uname -r` inside the distro, as `wsl --version` is translated) and fail with `kernel-too-old`, or `kernel-unreadable` when it can't read one, below the floor, and offer `wsl --update` as the fix. (W6) When the setup is done it shall report `default-distro` when `halonic` is the distro `wsl` starts by default, and `docker-desktop-visible` when Docker's socket or a `docker-desktop*` folder in `/mnt/wsl` can be seen from inside the distro.

## Examples

- Given Windows without WSL,
  when the setup runs and the administrator prompt is approved and asks for a restart,
  then the state is `restart-needed`, a `RunOnce` entry is set, and running again before Windows restarts stays `restart-needed`.
- Given the saved state `restart-needed` and a Windows that has restarted,
  when the setup runs,
  then the distro is imported, checked, and the setup is `done` and the `RunOnce` entry is gone.
- Given Windows without WSL where the administrator prompt is turned down,
  when the setup runs,
  then it ended `cancelled` and the state is `not-started`.
- Given Windows build 18363, or the `AllowWSL` policy at 0, or an install that says virtualisation is off,
  when the setup runs,
  then it is blocked with `not-supported`, `blocked-by-policy` or `virtualisation-off`, and nothing was installed or imported.
- Given WSL with a distro called `halonic` that Halonic didn't import (W8),
  when the setup runs,
  then it failed with `distro-not-ours` and `wsl --import` was not run.
- Given WSL whose kernel is below the floor (W11),
  when the setup checks,
  then it failed with `kernel-too-old` and the fix `update-wsl`.
- Given a distro that is the default, and Docker Desktop's socket visible in it (W6),
  when the setup is done,
  then the residuals are `default-distro` and `docker-desktop-visible`.
