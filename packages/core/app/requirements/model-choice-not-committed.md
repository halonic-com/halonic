# app.model-choice-not-committed

- Status: active
- Since: unreleased
- Source: HAL-16708 (HAL-14808 PR 4a, Liam's D3); HAL-16248 (the refusal's wording names the files)

When a host's save of the choice files fails with `ChoiceFilesNotCommitted`, because a file the choice would write has changes that aren't committed, Continue shall take its edits back, trust nothing and answer `{"ok": false, "failed": "not-committed", "files": [...], "keySaved": <boolean>, "reason": <text>}`, where `files` are the workspace paths the error names. Any other failed save shall answer `failed: "write"` as before.

Rationale: a host that commits only the choice files refuses rather than sweep someone's own edits into that commit, and the screen's line names those files, so the files travel as data rather than inside the reason's words.

## Examples

- Given a host's save fails with `ChoiceFilesNotCommitted(["models.yaml", "workspace.yaml"])` after the key was saved, then Continue answers `failed: "not-committed"` with those two files and `keySaved: true`, and the folder isn't trusted.
