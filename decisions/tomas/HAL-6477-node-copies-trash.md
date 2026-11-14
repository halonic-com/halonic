# Decision: two folders in the workspace's profile folder for run copies and the trash

- Approval: HAL-9301, where Liam decided part A of HAL-6477, the Node `RunCopies` and `Trash` included
- Kind: internal
- Task: HAL-6477

## What changes

`WorkspaceFolders` gains `runCopiesFolder()` (`run-copies`) and `trashFolder()` (`trash`), beside
the folders for proposals and worktrees. The requirement `profile.workspace-folders` lists them in
its sentence about the workspace's folders; its tests gain one case for both, on POSIX and Windows
paths. Nothing is renamed or removed.

`@halonicjs/adapter-fs-node` gains `FolderRunCopies` and `FolderTrash`, the Node versions of
`RunCopies` and `Trash`, with their own requirements and tests. Its `package.json` moves
`@halonicjs/app` from `devDependencies` to `dependencies`, because the two classes implement
types of that package.

## Why

A harness run with history off needs a copy of the workspace outside the workspace, and Accept needs a
trash that Undo can read, both in the profile and private to the user. Nothing uses them yet:
`halonic run` still refuses harness agents, and the CLI wiring is the next pull request.

No test was weakened or removed.

## Covers

- profile.workspace-folders
