# paperclip.pr-watcher-hand-back

- Status: active
- Since: unreleased
- Source: HAL-21150, the rule decided on HAL-21148: a reviewer on the native runner couldn't give a pull request's task back to its author, and the PR watcher skipped tasks their reviewer held, so it neither closed them after the merge nor woke the author when the queue dropped the pull request (HAL-21120, #6950)

When the PR watcher checks an open task that Liam, Julian or Nora holds as its reviewer (not the author every one of its pull requests' branches names) with no run of theirs queued or going, and either one of its open pull requests carries the holder's signed approval on its head, a finding by the holder made after its head was committed, or a head merge control holds, the PR watcher shall give the task to the author with status `todo` and wake them, with the comment "PR watcher: back to <author> after review, head `<sha>` (HAL-21150)." ("after the merge queue held it" for a held head) and a line linking the pull request, at most once per head, counting it in the pass summary as `handedBack`; a task in `backlog` or `blocked` and a draft's verdict don't move.

When every pull request of such a task merged and landed green, the PR watcher shall decide as if the author held the task: mark it done when the author's rules close it (no open child task, no hold line after the merge, no comment after the merge, the close guards), and otherwise give it to the author as above, with "after the merge"; a task in `backlog` or `blocked` is only marked done.

## Examples

- Given pull request 5701 by Mateo with Julian's signed approval on head `5701aaa`, its task held by Julian with no run,
  when the watcher runs twice,
  then the task goes to Mateo with `todo` once, with the comment "PR watcher: back to Mateo after review, head `5701aaa` (HAL-21150)."
- Given Nora's `[major]` finding made after the head was committed, the task held by Nora,
  when the watcher runs,
  then the task goes to Mateo.
- Given Julian's approval on an older head, a finding older than the head, or Julian's run going on the task,
  when the watcher runs,
  then the task stays with Julian.
- Given the pull request merged and landed green, the task held by Julian,
  when the watcher runs,
  then the task is marked done; with a comment after the merge, it goes to Mateo instead.
