# sandbox-srt.wsl-runtime-by-shell

- Status: active
- Since: unreleased
- Source: HAL-16770, HAL-16765 (scope: the setup runs from Windows, the shell installs the runtime); `sandbox-srt.wsl-setup`, `sandbox-srt.wsl-runtime`

Where the WSL setup is built with its runtime left to Studio's shell, the `installing-runtime` step shall not install a runtime and shall not run the distro's updater as root, and the setup shall then finish as `done` with `runtime: "left-to-shell"` in its result, so the caller knows the runtime isn't installed yet and that the shell installs it the next time it starts the host in the distro. The step's other work (the residuals, clearing the `RunOnce` entry, saving `done`) shall stay as it is. Where the setup is built with a runtime, its result shall not carry `runtime`.

## Examples

- Given WSL without Halonic's distro and a setup with its runtime left to the shell,
  when the setup runs,
  then the distro is imported and checked, no runtime install is asked for, and the result is `done` with `runtime: "left-to-shell"`.
- Given a finished setup over Halonic's own import, left to the shell, whose distro has no runtime,
  when the setup runs again,
  then it is `done` with `runtime: "left-to-shell"`, nothing is installed, and `wsl --import` is not run.
- Given a setup left to the shell over a distro whose image is older than the lowest Studio works with,
  when the setup is done,
  then the residuals include `image-outdated`.
