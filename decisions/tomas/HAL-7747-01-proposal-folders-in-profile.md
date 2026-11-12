# Decision: the profile gives each workspace three more folders for harness runs

- Approval: scope decided on [HAL-6476](/HAL/issues/HAL-6476), option 1 (Liam); the package owner (Liam) approves this note in review on [HAL-7747](/HAL/issues/HAL-7747)
- Kind: internal

## What changes

`profile.workspace-folders` now also names `proposal-worktrees`, `proposals` and `harness-temp`
inside a workspace's profile folder. They hold the worktrees a harness run's agents work in, the
records of what those runs changed, and the temp folders of their sandbox sessions. No example was
removed or weakened, and no existing folder moved.

## Why

The CLI's harness host (HAL-7747) needs these folders inside the profile, so that a harness run
never writes into the workspace itself or into another run's folders.

## Covers

- profile.workspace-folders
