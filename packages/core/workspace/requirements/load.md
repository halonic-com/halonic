# workspace.load

- Status: active
- Since: 0.1.0
- Source: HAL-1522 (HAL-186 implementation plan, step 1a)

When `loadWorkspace` reads a workspace through a `DefinitionSource`, the workspace package shall parse every file a registered kind places with that kind and its place id, return the parsed files sorted by path, return every error and warning with the file's path, the key path, the line and the column, list the files no kind places as ignored, and skip the reserved `.halonic/` folders without an issue.

## Examples

- Given the parity fixtures' base workspace, when it is loaded, then every one of its 32 files parses, with no error.
- Given an agent file whose `output.type` is `xml`, when it is loaded, then it is left out of the files and its issue names the file, the path `["output", "type"]`, line 3 and column 9.
- Given a provider file `providers/Spare.yaml` without an id, when it is loaded, then its issue says the id `Spare` comes from the file name.
- Given a file with a warning, when it is loaded, then it is among the files and the warning is among the issues with its file.
- Given `hubs/billing/.halonic/source.json` and `notes/README.md`, when the workspace is loaded, then the first is neither ignored nor an issue and the second is ignored.
- Given a file the source lists but no longer has when it is read, when the workspace is loaded, then it is left out without an issue.
