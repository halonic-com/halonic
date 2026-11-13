# studio.workspace-trust

- Status: active
- Since: 0.1.0
- Source: HAL-1291 (T3 trust core), HAL-65 trust requirements, HAL-7876 (shared trust reader)

When the desktop app opens a folder, it shall check the workspace's trust before the workspace is shown, reading the folder as the CLI reads it: the workspace's files through the loader, its local integrations through the folder reader, and each connector's program through the shell. It shall take the workspace's name from `workspace.yaml`, or the folder's own name when there is none. It shall answer the scope's `isTrusted` with yes only when the last check found a person's trust in exactly what the folder holds, and with no before the first check ends, while a check runs, and when a check fails. It shall check again after the workspace's files are saved.

## Examples

- Given `/work/acme` holds a `workspace.yaml` named "Acme" and nobody has trusted it,
  when the user opens it,
  then the switcher reads "Acme" and the assistant may write only Halonic items.
- Given a person trusted `/work/acme` with the CLI,
  when the user opens it in the Studio,
  then the Studio finds the same fingerprint and the workspace counts as trusted.
- Given a trusted connector's program moves to another folder on the PATH,
  when the user opens the workspace,
  then it counts as changed and is not trusted.
