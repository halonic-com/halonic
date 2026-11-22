# Decision: the linked worktree refusal names the repository's own folder

- Task: HAL-16506 (C715 #2 on HAL-16498)
- Approval: HAL-16506, Liam's review of the pull request; Liam signs this note as the CTO
- Kind: user-visible

## What changes

`git.repository-refused` keeps its rule and changes the fix in its first example. The fix for git files outside the folder now also offers to clone the repository again into a folder of its own, and says that `halonic test` and `halonic validate` still work in this folder. A new example covers a linked worktree: its fix names the folder of the repository it belongs to, read from the worktree's `.git` file.

Nothing the requirement promised before is taken away. The refusal is still `denied`, with the same message and one fix.

## Why

Flow check 73 (C715 #2) found the old fix, "Use the repository's own folder", didn't tell someone standing in a linked worktree which folder that is, and that `test` passed in the same folder where `run` then refused.

## Tests

No test was weakened or removed. The old test checks the new fix text, with the same number of checks, and a new test opens a real linked worktree and checks that the fix names the main folder.

## Covers

- git.repository-refused
