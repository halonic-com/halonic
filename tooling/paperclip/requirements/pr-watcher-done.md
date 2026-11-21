# paperclip.pr-watcher-done

- Status: active
- Since: unreleased
- Source: HAL-15359; the PR watcher rules in the seat plan on HAL-15298 (section 3, item 2), approved by the board on 21 Nov

When the PR watcher checks an open task whose author holds it and whose linked pull requests are all closed, the PR watcher shall mark the task done with a comment only if at least one of them merged and every merged one has `ci-ok` passed on its merge commit or is included in the commit of its base branch's newest successful CI push run.

## Examples

- Given a task linked to pull request 4485, merged with `ci-ok` passed on its merge commit,
  when the watcher runs,
  then it comments that #4485 merged green and marks the task done.
- Given pull request 468, merged on 9 Nov without `ci-ok` on its merge commit, and a later green CI run on `main` that includes it,
  when the watcher runs,
  then it marks the task done.
- Given pull request 4574, merged with its `ci-ok` on `main` still queued and the newest green CI run older than its merge,
  when the watcher runs,
  then it leaves the task as it is.
