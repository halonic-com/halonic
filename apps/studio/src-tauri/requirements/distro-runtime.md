# studio.src-tauri.distro-runtime

- Status: draft
- Since: unreleased
- Source: HAL-14644; HAL-15147; `infra/wsl-image/files/halonic-runtime`; `infra/wsl-image/runtime-archive.sh`

When the shell starts the host in Halonic's WSL distro, it shall, before anything runs the distro's host, read the runtime updater's `status` within 10 seconds and install the runtime that ships beside the app (`halonic-runtime.tar.gz`, pinned by `halonic-runtime.json`'s `version` and `sha256`) unless `status` names that version as `current`. It shall check the archive's SHA-256 on Windows and send nothing when it differs, run only the updater's fixed `install <version> <sha256>` step as root, with the archive on standard input, and stop the step after 300 seconds. It shall refuse a manifest whose version or SHA-256 the updater would refuse. A build with no `halonic-runtime.json` beside the app shall keep the distro's runtime. A runtime that couldn't be installed shall refuse the start as `host_unavailable` only when `status` answered that the distro has no current runtime, and still does when read again after the failed install (a second read that fails keeps the first answer); when `status` names one or couldn't be read, the host shall start on the distro's runtime. Each outcome shall be logged.

## Examples

- Given a distro whose `current` is `0.1.0` and a Studio that ships `0.1.1+0123456789ab`,
  when the page's first `agent_host_*` call starts the host in the distro,
  then the shell installs `0.1.1+0123456789ab` before the host starts, and logs "runtime: installed 0.1.1+0123456789ab (was 0.1.0)".
- Given a distro whose `current` is already the version Studio ships,
  when the host starts there,
  then the shell runs no install.
- Given a distro with no runtime and an archive whose SHA-256 isn't the pinned one,
  when the host starts there,
  then nothing is sent into the distro and the call is refused as `host_unavailable`.
- Given a distro whose `current` is `0.1.0` and an install that takes longer than 300 seconds,
  when the host starts there,
  then the install is stopped, the host starts on `0.1.0`, and the log says why.
- Given a distro whose `status` couldn't be read within 10 seconds and an install that fails,
  when the host starts there,
  then the host starts on whatever runtime the distro has, and the log says the status couldn't be read.
