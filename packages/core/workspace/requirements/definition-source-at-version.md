# workspace.definition-source-at-version

- Status: active
- Since: 0.1.0
- Source: save model 2.2 (HAL-1102, HAL-3236 task 2, HAL-3246); stub `engine.definition-source-at-version` in req-core-engine

The workspace package shall give a `DefinitionSource` at a commit (`VersionSource`) that reads and lists files only through `Vcs.readAt` and `Vcs.listAt` at that commit, never from the files on disk, and whose version is the commit id. It shall refuse unsafe and private paths as the `DefinitionSource` port says, before it asks the version control, and refuse a version that isn't a full commit id.

## Examples

- Given `agents/briefing.agent.yaml` committed at a commit with `model: fast` and saved later with `model: smart`, when the source at that commit is loaded, then the agent has `model: fast` and the workspace's version is the commit id.
- Given a workflow that isn't in the commit, when the source at that commit reads or lists it, then it isn't found, rather than the saved file.
- Given a read of `.env` or a listing of `.git`, then it is refused with a `RangeError` and the version control isn't asked.
- Given the version `HEAD` or a short id such as `3f9a0c1`, then making the source is refused with a `RangeError`.
