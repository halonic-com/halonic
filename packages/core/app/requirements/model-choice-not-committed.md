# app.model-choice-not-committed

- Status: active
- Since: unreleased
- Source: HAL-16708 (HAL-14808 PR 4a, Liam's D3); HAL-16248 (the line that names the files)

If the host's save of a model choice's files throws `ChoiceFilesNotCommitted`, then Continue shall take the choice's file changes back and answer `{"ok": false, "failed": "not-committed", "keySaved": <boolean>, "files": […], "reason": <the error's message>}`, with `files` as the error names them.

Rationale: `halonic serve` saves only choice files without changes of their own, so it never commits someone's own edits (D3). The screen then names those files, so Continue passes them on, apart from any other failed write.

## Examples

- Given the save throws `ChoiceFilesNotCommitted` naming `models.yaml` and `workspace.yaml` after the key was saved, then Continue answers `failed: "not-committed"`, `keySaved: true` and those two files, and nothing waits to be saved.
