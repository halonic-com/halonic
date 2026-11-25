# studio.src-tauri.crates.agent-host.opened-workspaces

- Status: draft
- Since: unreleased
- Source: HAL-18311 (Settings › Connections showed "couldn't read the connections" for a folder opened after Studio started)

When the person opens a folder after the agent host started, the shell shall name it to each host that runs beside the shell and whose secrets it answers for, with one `data` frame on connection id 0 holding exactly `{"op":"open_workspace","folder":…}`, before its next call to that host. It shall name each folder once per host, only folders it has opened itself (the same list it names with `--sweep-root` at start), and nothing a page asks for. It shall not wait for an answer: the host sends none (requirement `agent-host.opened-workspaces`). The notice shall go between the answers to the host's secret requests, never inside one. If the folder's path isn't UTF-8, or its notice wouldn't fit in one frame of 64 KiB, then the shell shall not name it. A host in Halonic's WSL distro sees other paths than the shell's, so the shell shall name no folder to it.

## Examples

- Given a host beside the shell, started before the person opened a folder,
  when the page next calls the host,
  then the host got `{"op":"open_workspace","folder":…}` for that folder on id 0 first, and once only.
- Given a channel whose host stopped,
  when the shell would name a folder,
  then it sends nothing.
- Given a folder whose path isn't UTF-8,
  when the shell names the open folders,
  then that folder is skipped.

## What it doesn't cover

The host's side, which checks each folder and adds it to the workspaces it serves, is `agent-host.opened-workspaces`. A folder isn't taken back when the person closes it: that can come later.
