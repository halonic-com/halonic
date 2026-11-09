# contracts.vcs-safety

- Status: active
- Since: 0.1.0
- Source: HAL-181 (private paths too, decided there); HAL-6 finding 7 (the old desktop app's git option blocklist could be bypassed with a prefix such as `--upload-pac=`); `Vcs` port v1

Where an adapter implements `Vcs`, it shall refuse with a `RangeError`, before anything runs, every path that a `DefinitionSource` refuses, unsafe or private, which includes every way of naming the repository's own files (a `.git` segment in any case, with trailing dots or spaces, with code points HFS+ ignores, or as `git~1`), even next to a safe path, and shall change nothing. It shall treat a path that starts with `-` as a file name and touch only that file. It shall refuse with a `RangeError` a branch name that starts with `-`, is `HEAD`, or that `git check-ref-format --branch` refuses, and accept every name git accepts. It shall commit a message that looks like a git option as the message.

## Examples

- Given a repository with staged and unstaged changes,
  when `stage(["a.yaml", ".GIT/config"])` or `discard(["git~1/config"])` is called,
  then it rejects with a `RangeError` and the status, the files and the history are unchanged.
- Given a repository,
  when `stage([".env.local"])` or `diff(".studio/trust.json", false)` is called,
  then it rejects with a `RangeError`.
- Given a tracked file named `--output=written.txt` with a change,
  when it is diffed, staged, unstaged and discarded,
  then only that file changes, and no file `written.txt` appears.
- Given an untracked file `-f` next to an untracked `keep.yaml`,
  when `-f` is discarded,
  then `keep.yaml` is still there.
- Given a repository,
  when `createBranch("--upload-pac=touch pwned")` or `checkout("-b")` is called,
  then it rejects with a `RangeError` and the branches are unchanged.
- Given a staged change,
  when it is committed with the message `--amend`,
  then a new commit with that message is added and the earlier commit is still there.
