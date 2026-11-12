# halonic-agent-host

Starts the agent host (`apps/agent-host`) for the Studio shell (HAL-4878). The host runs the sandbox, the Halonic bridge and the harnesses, which need Node, and serves them on loopback with a token per launch.

- **Finding it:** `executable_beside` names `halonic-agent-host` (`.exe` on Windows) in the folder of the shell's own executable. Packing it into the installers comes with the release work (E2).
- **Starting it:** `host_command` adds `--profile-folder <profile>`, and `--sweep-root <folder>` for each folder the host may sweep kept Windows grants in; the shell names the profile and the folders the person has open (HAL-6256). `AgentHost::start` pipes the host's standard input and output and waits up to the given time for its one handshake line. Its errors go to the shell's own; a Windows release shell is a GUI program and has none, so there they are lost for now. On Windows the host starts with `CREATE_NO_WINDOW`, so it opens no console window.
- **The handshake:** `{"url","token"}`, where `url` must be `http://127.0.0.1:<port>` and `token` 43 base64url characters. Anything else, including a line that isn't UTF-8, is refused, so the token is never sent anywhere but loopback. No error repeats the line, and `Debug` hides the token.
- **Keeping it running:** the host stops when its standard input closes, so `AgentHost` holds that input open. After the handshake, a thread reads and drops the rest of the host's output, so a full pipe never blocks it.
- **Stopping it:** `stop(grace)`, or dropping the `AgentHost`, closes the input and waits for the host to close its sessions and exit (5 s on drop). After that it is killed. Either way it is waited for, so no zombie is left.

- **In the WSL distro** (`wsl.rs`, HAL-5396): on Windows with the `srt-wsl` sandbox, the host and the engine run in Halonic's own distro. `wsl_exe` names `wsl.exe` in `%SystemRoot%\System32` by its full path, never through `PATH`. `distro_host_command` starts `/opt/halonic/current/bin/halonic-agent-host` with `-d halonic --cd / --exec` and fixed arguments only; project names and paths never go on the command line (security review W7). `runtime_command` runs a step of the image's runtime updater (`infra/wsl-image`) as root, and `install_runtime` checks the runtime archive's SHA-256 on Windows before it streams the archive to the updater, which checks it again (W2). The updater's exit codes come back as `WslError`. Choosing between this and the local host comes with the sandbox choice.

The crate has no Tauri types, so it builds and tests anywhere. The tests start stand-in hosts, small `sh` or `cmd` scripts, on all three systems.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves (`handshake_`, `lifetime_`, `wsl_launch_`, `runtime_update_`).
