# git.vcs-commits

- Status: retired
- Since: 0.1.0
- Source: HAL-3245 (`Vcs` port v2, git part 5 to come); HAL-3354; the memory Vcs's `memory.vcs-commits`

While git part 5 of HAL-3245 hasn't landed, the git Vcs shall refuse `commitVersion`, `commitWorktreeTo`, `readRef` and `deleteRef` with an error that names the method, and change nothing in the folder or the repository.

## Examples

- Given a repository with `a.yaml` committed and changed on disk,
  when `commitVersion` is called,
  then it is refused with "The git Vcs can't commitVersion yet", and the status and the log are the same as before.
