# Decision: the Studio checks a folder's trust when it opens it

- Approval: the board-approved workspace and trust flows (flow-workspace, HAL-177; HAL-65 trust requirements) built in HAL-1291; the package owner (Liam) approves this note in review
- Kind: internal

## What changes

`studio.open-folder` no longer says an opened folder is untrusted and named after its folder. It
points to the new `studio.workspace-trust`: the desktop app checks the folder's trust before it
shows the workspace, reading it as the CLI does, and names the workspace from `workspace.yaml`.
Only a person's trust in exactly what the folder holds lets the assistant write more than Halonic
items.

## Why

The trust check has to give one fingerprint for one folder in the CLI and the Studio. The Studio
now reads through the shell's folder reader and command lookup (HAL-8144, HAL-7876) and the shared
subject builder, so it does. Until a person trusts a folder, nothing changes for the user: the
workspace stays untrusted, the safe default.

## Covers

- studio.open-folder
