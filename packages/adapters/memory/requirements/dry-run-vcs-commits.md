# memory.dry-run-vcs-commits

- Status: active
- Since: 0.1.0
- Source: HAL-3354; plan points 8 and 9 on HAL-3245; HAL-1662

The dry-run Vcs shall record `commitVersion`, `commitWorktreeTo` and `deleteRef` instead of making them, giving a made-up commit id that starts with `dry-run:`, and shall read `readRef` through to the repository it wraps. It shall refuse, and record nothing for, a path or a proposal ref the port refuses, an empty `include` or message, a parent that isn't a full commit id or that the repository doesn't have, and any of these changes in a folder that isn't a repository while no `init` is recorded.

## Examples

- Given a dry run, when a version is created and a proposal committed and deleted, then `changes()` reports all three in order, and the repository has no new commit and no proposal ref.
- Given a dry run, when `refs/heads/main` is deleted, then it is refused with a `RangeError` and nothing is recorded.
