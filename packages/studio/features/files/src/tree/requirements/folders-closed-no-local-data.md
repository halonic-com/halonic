# files.tree.folders-closed-no-local-data

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U4, U32 (Now); changed by the save-model decision, HAL-1102; req-files (HAL-110); HAL-1293

The file tree shall show the workspace folder as it is on disk, folders first and then files, each sorted by name, folders closed until opened, and never the `.studio`, `.git` or `node_modules` folders.

## Examples

- Given a workspace with `workspace.yaml`, `models.yaml`, `providers/local.yaml`, `hubs/p/hub.yaml`, `skills/tone.md` and `.studio/runs/r1.jsonl`,
  when the user shows "Files",
  then the top rows are "hubs", "providers", "skills", "models.yaml", "workspace.yaml".
- Given the same, when the user opens "hubs" and then "p", then "hub.yaml" shows at depth 2.
- Given the user creates `hubs/p/agents/b.agent.yaml` in Halonic, then it is in the folder and in the tree at once.
- Given the user deletes `models.yaml`, then it is gone from the folder and the tree at once (it is in the trash).
