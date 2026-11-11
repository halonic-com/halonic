# studio.src-tauri.crates.agent-host.runtime-update

- Status: draft
- Since: 0.1.0
- Source: HAL-5396; design HAL-3779 section 5.3; security review HAL-5407 (W2)

When the shell installs a Halonic runtime into the WSL distro, it shall first compute the SHA-256 of the archive on Windows and compare it with the one the release expects. When they differ, or the archive can't be read, it shall start nothing and report why. Otherwise it shall run the updater's install step with the archive on standard input. When the updater ends with an error, the shell shall report its reason: a sandbox session is running (3), the SHA-256 differs (4), the archive is refused (5), there is no earlier version (6), or any other exit code.

## Examples

- Given an archive whose SHA-256 isn't the expected one,
  when the shell installs it,
  then `wsl.exe` isn't started and the error says the archive isn't the one expected.
- Given an archive with the expected SHA-256,
  when the shell installs it,
  then the updater reads exactly the archive's bytes on its standard input.
- Given an updater that ends with exit code 3,
  when the shell runs it,
  then it reports that a sandbox session is running.
