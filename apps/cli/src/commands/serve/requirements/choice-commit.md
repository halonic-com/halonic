# cli.commands.serve.choice-commit

- Status: active
- Since: unreleased
- Source: HAL-14808 (Liam's D3); HAL-16248 (the refusal's wording); HAL-16722 (the commit message, C754)

When Continue saves a model choice in a served window and the workspace has history, the `halonic serve` command shall write only the choice files it changes (`models.yaml`, `workspace.yaml`, the one `providers/<name>.yaml`) and commit only those, in one commit with the message "Save the model picked through halonic serve", leaving every other file, staged or not, as it was.

If one of those files already has changes that aren't committed, staged or not, then the command shall write and commit nothing and refuse with "Couldn't save: <files> has changes that aren't committed. Commit or undo them, then try again.", naming each such file, "a and b" for two and "a, b and c" for more, with "have" for more than one.

If writing or committing the files fails, then the command shall put each file back as it was before the save.

When the workspace has no history, the command shall write the files without a commit. The command shall save one choice at a time.

Rationale: served runs start from the live version, so a choice only written to disk would change nothing they use. A commit of only the choice files never sweeps someone's own edits into it, and a refusal leaves their edits as they are (D3).

## Examples

- Given `models.yaml` is changed by the choice and `notes.md` has an edit that isn't committed, then the commit holds `models.yaml` only and `notes.md` is still changed.
- Given `models.yaml` has an edit that isn't committed, then nothing is written and the refusal reads "Couldn't save: models.yaml has changes that aren't committed. Commit or undo them, then try again."
- Given `models.yaml` and `workspace.yaml` both have such edits, then it reads "Couldn't save: models.yaml and workspace.yaml have changes that aren't committed. …".
