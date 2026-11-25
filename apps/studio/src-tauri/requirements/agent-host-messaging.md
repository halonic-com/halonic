# studio.src-tauri.agent-host-messaging

- Status: draft
- Since: unreleased
- Source: HAL-18311 (option A), HAL-18323; Settings › Connections, Inbox and Messenger couldn't read a workspace on Windows while the harnesses' host ran in Halonic's WSL distro

Where the shell runs on Windows and the person's sandbox choice starts the harnesses' host in Halonic's WSL distro (a saved `srt-wsl`, or no saved choice), the shell shall also start the agent host beside itself with `--messaging-only` and `--keychain-relay`, from the same executable, for the same profile folder and with the same `--sweep-root`s as the local host would have, and shall send every call whose path starts with `/v1/messaging/` or `/v1/paperclip/` to it, and every other call to the harnesses' host. It shall keep one messaging host at a time, take its address and token from its own handshake, start a new one when it has exited, stop it when it stops the harnesses' host on quit or before an update, and stop it when a new sandbox choice moves the harnesses' host. Before each call to the messaging host it shall name the folders opened since it started (requirement `studio.src-tauri.crates.agent-host.opened-workspaces`). On Linux, on macOS, and on Windows when the harnesses' host runs beside the shell, the shell shall start no second host: the one host serves the messaging too.

## Examples

- Given Windows with no saved sandbox choice,
  when the page calls `POST /v1/paperclip/connections`,
  then the shell starts the host beside itself with `--messaging-only` and the call goes to it, while `GET /v1/health` goes to the host in the distro.
- Given a messaging host that runs,
  when the page calls a messaging route again,
  then the same messaging host answers and no second one starts.
- Given Windows with a saved choice of `srt`, or Linux, or macOS,
  when the page calls `POST /v1/paperclip/connections`,
  then the one host answers it and no messaging host starts.
- Given the person opened a folder after the messaging host started,
  when the page calls `POST /v1/paperclip/connections` for it,
  then the shell has named the folder to the messaging host, and the host has answered that it handled it, before the call.

## What it doesn't cover

What the messaging host serves and refuses is `agent-host.messaging-only`. A Linux or macOS profile whose choice is `srt-wsl` keeps the one host.
