# first-run.pick-model-not-committed

- Status: active
- Since: unreleased
- Source: HAL-16637 (HAL-14808 PR 4b, Liam's D3); HAL-16248 (the wording), decided by the team under HAL-2282

If Continue saves nothing because choice files have changes that aren't committed, then the Pick a model screen shall stay open and say, in red, "Couldn't save: <files> has changes that aren't committed. Commit or undo them, then try again.", naming each file by its workspace path ("models.yaml", "workspace.yaml", "providers/<name>.yaml"): "a and b" for two, "a, b and c" for three or more, with "have" in place of "has" for more than one.

Rationale: a served Continue commits only the choice files and never sweeps someone's own edits into that commit, so it refuses; the line says which files to commit or undo.

## Examples

- Given `models.yaml` has changes that aren't committed, then the line reads "Couldn't save: models.yaml has changes that aren't committed. Commit or undo them, then try again."
- Given `models.yaml` and `workspace.yaml` have them, then it reads "Couldn't save: models.yaml and workspace.yaml have changes that aren't committed. …".
