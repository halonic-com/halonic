# workspace.copy

- Status: active
- Since: 0.1.0
- Source: HAL-2336 step 3 (`halonic init --example acme`, cli-output 3.1: "A second copy never overwrites"); the `.gitignore` from `workspace.init`

When `copyWorkspace` lays out a copy of a workspace through an empty `DefinitionStore`, the workspace package shall write every file the source lists, with a `.gitignore` that lists `.env` and `.env.*` when the source has none, write `workspace.yaml` last, and return the files it wrote as data. If the target lists any file, then it shall write nothing and say that the target isn't empty. If a write fails, then it shall remove the files it wrote and throw the write's error.

## Examples

- Given a source with a `workspace.yaml` and an agent and an empty target, when it is copied, then the target holds both files and a `.gitignore` with `.env` and `.env.*`, `.gitignore` is written first and `workspace.yaml` last, and loading the target gives no issue.
- Given a source with its own `.gitignore`, when it is copied, then the target's `.gitignore` is the source's.
- Given a target with a `notes.txt`, when a workspace is copied into it, then nothing is written and the answer is that the target isn't empty.
- Given a target where writing `workspace.yaml` fails, when a workspace is copied, then the error is thrown, the target is empty again, and copying again afterwards works.
