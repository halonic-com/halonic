# workspace.create

- Status: active
- Since: 0.1.0
- Source: HAL-8714 (T3 New workspace dialog; flow-workspace 2.3: "Elena moves the template into one `core` function that CLI and Studio both call"; HAL-65 decision 1, [J11]); builds on `workspace.init`

When `createWorkspace` lays out a new workspace through a `DefinitionStore`, the workspace package shall write the same `.gitignore` and `workspace.yaml` as `initWorkspace`, write only the template files the store doesn't already have, add the `.env` lines a `.gitignore` there lacks at its end, and return the paths it wrote, skipped and amended as data. If the store already holds a `workspace.yaml`, or the settings fail the workspace kind's checks, or `ifNotEmpty` is `"refuse"` and the store lists any file, then it shall write nothing and say why. If a write fails, then it shall remove the files it wrote, put back the `.gitignore` it amended and throw the write's error. `initWorkspace` shall be `createWorkspace` with `ifNotEmpty: "refuse"`.

## Examples

- Given an empty store, when a workspace named `Acme` is created, then `.gitignore` and `workspace.yaml` are written, nothing is skipped, and the result matches what `initWorkspace` gives.
- Given a store with only a `.gitignore` that lists `.env` and `.env.*`, when a workspace is created, then `workspace.yaml` is written, the `.gitignore` is skipped and unchanged.
- Given a store with a `.gitignore` of `node_modules/` only, when a workspace is created, then `.env` and `.env.*` are added at its end and the path is `amended`, not `skipped`.
- Given a store with a `workspace.yaml`, when a workspace is created, then nothing is written and the answer is `already_workspace`.
- Given a store with a `notes.txt`, when a workspace is created, then both template files are written and `notes.txt` is unchanged.
- Given the id `Acme`, when a workspace is created, then nothing is written and the problem names the key path `["id"]`.
- Given a store where writing `workspace.yaml` fails, when a workspace is created in a store that had a `.gitignore`, then that `.gitignore` is still there; one the call wrote is removed.
