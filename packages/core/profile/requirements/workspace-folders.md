# profile.workspace-folders

- Status: active
- Since: 0.1.0
- Source: HAL-191; HAL-2022 G4 and the run-storage decisions on HAL-1220

The profile package shall give each workspace one folder in the profile, at `workspaces/<key>`, where the key is the first 32 hex characters of the SHA-256 of the workspace's real path, ignoring case on Windows. The workspace's runs shall go in `runs` inside that folder, a deployment's runs in `deployments/<id>/runs`, and the blobs its runs refer to in `blobs`. It shall throw a `RangeError` for a workspace path that is not absolute, and for a deployment id that is not 1 to 128 lowercase letters, digits, `-` or `_` starting with a letter or digit, or that is a Windows device name.

## Examples

- Given one workspace path, when its folders are asked for twice, then both answers are the same, and its runs folder ends in `runs`.
- Given two different workspace paths, when their folders are asked for, then they differ.
- Given Windows and one workspace path written in two cases, when their folders are asked for, then they are the same.
- Given deployment `staging`, when the runs folder is asked for, then it ends in `deployments/staging/runs`.
- Given deployment `../staging` or `con`, when the runs folder is asked for, then it throws a `RangeError`.
