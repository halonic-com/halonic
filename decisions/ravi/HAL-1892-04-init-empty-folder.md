# Decision: initWorkspace lays out a workspace only in an empty store

- Requirement: `workspace.init` (`packages/core/workspace/requirements/init.md`)
- Task: HAL-1892; the words come from cli-output 3.1, approved by the board on HAL-2123
- Approval: the maintainer approves this note in review

## What changes

`workspace.init` let a store that already had files become a workspace: only a `workspace.yaml`
stopped it, and an existing `.gitignore` gained the missing lines. The approved `halonic init`
words say otherwise: a folder that isn't empty is a conflict ("Couldn't create the workspace in
./acme: the folder isn't empty."), so `init` never mixes a workspace into files a person made.

- A store that lists any file is refused with `not_empty`. It replaces `already_a_workspace`,
  since a workspace is never empty. Private entries such as `.git` aren't listed by the port, so
  a folder fresh from `git init` still counts as empty.
- The three `.gitignore` examples go, since a store with a `.gitignore` is now refused. A new
  example says such a store is left alone and its `.gitignore` is unchanged.
- The write-fails example is stronger: the `.gitignore` written first is removed again, so the
  store is empty once more and the call can be repeated.
- `InitializedWorkspace.files` is now a list of paths. Every file is created, so the `change`
  field had only one value left. Its only caller is the unmerged `halonic init` command.

## Tests

No guard was weakened. The tests for the removed examples go with them, the "already a workspace"
test checks the new error, and new tests cover a store with only a `.gitignore` and a removal that
fails after the write failed.
