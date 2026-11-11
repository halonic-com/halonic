# studio.src-tauri.crates.agent-host.wsl-launch

- Status: draft
- Since: 0.1.0
- Source: HAL-5396; design HAL-3779 section 5.1; security review HAL-5407 (W7)

When the shell starts a program in Halonic's WSL distro, it shall start `wsl.exe` by its full path in the `System32` folder of `%SystemRoot%`, never through `PATH`, and only when `%SystemRoot%` is a full path on a drive with no `..` in it. It shall always pass `-d halonic`, an explicit user with `-u`, `--cd /` and `--exec` with the program's full path in the distro, so no shell reads the arguments, and only fixed arguments after it: the agent host runs as `halonic` (`-u halonic`), never as the distro's default user, and gets `--profile-folder` with the `halonic` user's `~/.local/share/halonic`, and the runtime updater runs as root (`-u root`) with one step and, to install, a version and a SHA-256 in the form the updater accepts. A version or SHA-256 in any other form shall be refused before `wsl.exe` starts. Project names and paths shall never be arguments. It shall remove `WSLENV` from the command's environment, so no Windows variable crosses into the distro.

## Examples

- Given `%SystemRoot%` is the Windows folder on drive C,
  when the shell starts the agent host in the distro,
  then it runs `wsl.exe` from that folder's `System32` with `-d halonic -u halonic --cd / --exec /opt/halonic/current/bin/halonic-agent-host --profile-folder` and the `halonic` user's data folder, without `WSLENV`.
- Given `%SystemRoot%` isn't set, or is a relative or network path,
  when the shell would start `wsl.exe`,
  then it refuses and starts nothing.
- Given a version `$(x)` or `current`,
  when the shell would install a runtime,
  then it refuses and starts nothing.
