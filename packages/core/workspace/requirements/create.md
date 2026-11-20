# workspace.create

- Status: active
- Since: unreleased
- Source: HAL-8714 (T3 New workspace dialog; flow-workspace 2.3: "Elena moves the template into one `core` function that CLI and Studio both call"; HAL-65 decision 1, [J11]); builds on `workspace.init`; the Default hub and the test model from the board's answer on HAL-12723 (HAL-14118)

When `createWorkspace` lays out a new workspace through a `DefinitionStore`, the workspace package shall write the same files as `initWorkspace`, write only the template files the store doesn't already have, leave out the Default hub when the store has a `hubs/` folder and the test model's `models.yaml` and `providers/mock.yaml` when it has a `models.yaml` or a `providers/` folder, listing what it leaves out as skipped, add the `.env` lines a `.gitignore` there lacks at its end, and return the paths it wrote, skipped and amended as data. If the store already holds a `workspace.yaml`, or the settings fail the workspace kind's checks, or `ifNotEmpty` is `"refuse"` and the store lists any file, then it shall write nothing and say why. If a write fails, then it shall remove the files it wrote, put back the `.gitignore` it amended and throw the write's error. `initWorkspace` shall be `createWorkspace` with `ifNotEmpty: "refuse"`.

## Examples

- Given an empty store, when a workspace named `Acme` is created, then `.gitignore`, `hubs/default/hub.yaml`, `models.yaml`, `providers/mock.yaml` and `workspace.yaml` are written, nothing is skipped, and the result matches what `initWorkspace` gives.
- Given a store with only a `.gitignore` that lists `.env` and `.env.*`, when a workspace is created, then the other template files are written, the `.gitignore` is skipped and unchanged.
- Given a store with a `.gitignore` of `node_modules/` only, when a workspace is created, then `.env` and `.env.*` are added at its end and the path is `amended`, not `skipped`.
- Given a store with a `workspace.yaml`, when a workspace is created, then nothing is written and the answer is `already_workspace`.
- Given a store with a `models.yaml`, when a workspace is created, then the Default hub, `.gitignore` and `workspace.yaml` are written, `models.yaml` and `providers/mock.yaml` are skipped, and `models.yaml` is unchanged.
- Given a store with `providers/ollama.yaml`, when a workspace is created, then `models.yaml` and `providers/mock.yaml` are skipped and not written.
- Given a store with `hubs/billing/hub.yaml`, when a workspace is created, then `hubs/default/hub.yaml` is skipped and the test model is written.
- Given a store with a `notes.txt`, when a workspace is created, then every template file is written and `notes.txt` is unchanged.
- Given the id `Acme`, when a workspace is created, then nothing is written and the problem names the key path `["id"]`.
- Given a store where writing `workspace.yaml` fails, when a workspace is created in a store that had a `.gitignore`, then that `.gitignore` is still there; one the call wrote is removed.
