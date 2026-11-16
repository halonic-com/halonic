# Decision: the memory Vcs gains `diverged`

- Approval: Liam approved this in the review of #3073 (HAL-10722)
- Kind: internal
- Task: HAL-10722

## What changes

`memory.vcs` now also covers the new `Vcs.diverged()` method. `diverged` is refused when the
remote has lost the upstream branch, like `pull`. It gives `null` unless the branch and its
upstream both have commits the other lacks. Otherwise it gives the sorted paths that both sides
changed since they parted and that now differ. No example is removed.

## Why

The `Vcs` port gains `diverged` for the per-item choices on the Changes page (HAL-10717). The
memory adapter must behave like the git adapter under the shared contract, so its requirement
has to say what `diverged` does.

## Covers

- memory.vcs
