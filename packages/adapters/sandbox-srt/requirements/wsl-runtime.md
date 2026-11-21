# sandbox-srt.wsl-runtime

- Status: active
- Since: unreleased
- Source: HAL-14644, HAL-5396 (the runtime updater), HAL-14642

When the `checking` step has passed, the WSL setup shall run an `installing-runtime` step that puts the runtime Studio ships (its version, SHA-256 and archive) in Halonic's distro through the host's `installRuntime`, which runs the image's updater as root, only when `halonic-runtime status` in the distro doesn't name that version as current, so that running the setup again repairs a missing or other runtime without importing the distro again and changes nothing when the runtime is in place. It shall count the updater's exit 0, or exit 2 when the version has become current, as installed, and then finish the setup. It shall fail with `runtime-busy` when the updater says a sandbox session runs (exit 3), keeping the step so the next run tries again, and with `runtime-install-failed` on any other exit code or when the updater didn't start.

## Examples

- Given WSL without Halonic's distro,
  when the setup runs,
  then the distro is imported and checked, the shipped runtime is installed once after the check, and the setup is `done`.
- Given a finished setup over Halonic's own import whose distro has no runtime,
  when the setup runs again,
  then the runtime is installed and `wsl --import` is not run.
- Given a distro whose current runtime is the shipped version,
  when the setup runs again,
  then nothing is installed.
- Given a sandbox session running in the distro,
  when the step installs,
  then the setup failed with `runtime-busy`, the saved step is `installing-runtime`, and the next run finishes it.
- Given an updater that refuses the archive (exit 4 or 5),
  when the step installs,
  then the setup failed with `runtime-install-failed`.
- Given a distro in which nothing starts,
  when the setup runs,
  then it fails in `checking` and the runtime is not sent.
