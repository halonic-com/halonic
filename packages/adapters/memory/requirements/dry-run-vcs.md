# memory.dry-run-vcs

- Status: active
- Since: 0.1.0
- Source: HAL-1662 (plan approved by the maintainer); point 3 of the Docker research (HAL-1600), approved on HAL-1649; Compose's `pkg/dryrun`

The dry-run Vcs shall read through to the repository it wraps and shall never change it. When asked to stage, unstage, discard, commit, check out, create a branch, init, pull or push, it shall record the call instead, so `changes()` returns every such call in the order asked; its reads shall describe the wrapped repository without the recorded changes. A recorded commit shall return a hash starting `dry-run:`. It shall refuse, and record nothing for, a path the `Vcs` port refuses or the wrapped repository refuses to diff, an invalid branch name, an empty commit message, and any change but `init` to a folder that isn't a repository while no `init` is recorded.

## Examples

- Given a repository with one commit and a changed `a.yaml`,
  when the caller stages `a.yaml`, commits and pushes through a dry run,
  then `changes()` reports the stage, the commit and the push in that order, and the repository's status, log and files are unchanged.
- Given a folder that isn't a repository,
  when the caller stages a file through a dry run, then records `init` and stages it again,
  then the first stage is refused and the second is recorded.
