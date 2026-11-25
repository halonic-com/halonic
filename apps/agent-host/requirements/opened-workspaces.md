# agent-host.opened-workspaces

- Status: draft
- Since: unreleased
- Source: HAL-18311 (Settings › Connections showed "couldn't read the connections" for a folder opened after Studio started)

Where Studio's shell starts the agent host with `--keychain-relay`, the shell may send the host, at any time after the handshake, a notice on connection id 0: one `data` frame holding exactly `{"op":"open_workspace","folder":…}`, the folder the person opened. When the host gets one, it shall add the folder's real path to the workspaces it serves, as if the launcher had named it at start, until the host stops; and every route that takes a workspace shall accept that folder from then on. The host shall send no answer to a notice. A notice isn't an answer to a secret request: it shall neither settle nor break a request that waits (requirement `agent-host.keychain-secrets`), and a frame that isn't exactly a notice shall go to the secrets channel, as before.

If the folder doesn't exist, isn't a folder, or is Halonic's profile folder, then the host shall not add it, and shall write why to its standard error, which the shell keeps in its log, without the folder's path. No route shall add a workspace: only the shell's channel can, so a page can't name a folder of its choosing.

## Examples

- Given a host started with `--keychain-relay` and no workspace,
  when the shell names a folder that exists,
  then `POST /v1/paperclip/connections` for that folder answers 200, not 404 `unknown_workspace`.
- Given a host waiting for the shell's answer to a secret request,
  when the shell names a folder before it answers,
  then the request still gets its answer, and the folder is added.
- Given a folder that doesn't exist,
  when the shell names it,
  then the host serves no new workspace and its standard error says the folder doesn't exist, without its path.
- Given the profile folder,
  when the shell names it,
  then the host doesn't add it.
- Given a page with the host's token,
  when it calls any route with a folder the shell never named,
  then the answer is 404 `unknown_workspace`, as before.

## What it doesn't cover

The shell's side, which names each folder the person opens to the hosts that run beside it, is the shell's requirement `studio.src-tauri.crates.agent-host.opened-workspaces`. A folder isn't taken away when it is closed: that can come later. A host in Halonic's WSL distro sees other paths than the shell's, so the shell names no folder to it.
