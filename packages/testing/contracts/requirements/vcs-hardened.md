# contracts.vcs-hardened

- Status: active
- Since: 0.1.0
- Source: HAL-181; HAL-9 plan section 11 (the git adapter always runs hardened), decided on HAL-181; `Vcs` port v1

Where a `Vcs` adapter drives git, it shall run every git command with `core.fsmonitor=false` and `core.hooksPath` pointing at an empty folder, whether the workspace is trusted or not, so that no hook and no fsmonitor command planted in the repository runs. An adapter that drives git shall give the suite a way to plant them; one that runs no git, such as the memory adapter, declares so and the cases are skipped.

## Examples

- Given a repository with every hook the port's commands could start planted in `.git/hooks` and in a `core.hooksPath` set in the repository's config,
  when files are diffed, staged, unstaged, discarded and committed, and a branch is created and checked out,
  then no planted hook has run.
- Given two clones of one remote with the same hooks planted,
  when one pushes a commit and the other pulls it,
  then the pull brings the change and no planted hook has run.
- Given a repository whose config sets `core.fsmonitor` to a command,
  when its status is read and a change is staged and committed,
  then the command has not run.
