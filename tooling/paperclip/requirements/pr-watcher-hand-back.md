# paperclip.pr-watcher-hand-back

- Status: active
- Since: unreleased
- Source: HAL-21150, the rule decided on HAL-21148: a reviewer on the native runner couldn't give a pull request's task back to its author, and the PR watcher skipped tasks their reviewer held, so it neither closed them after the merge nor woke the author when the queue dropped the pull request (HAL-21120, #6950)

When the PR watcher checks an open task that Liam, Julian or Nora holds as its reviewer (not the author every one of its pull requests' branches names) with no run of theirs queued or going, and one of its open pull requests, out of draft, carries the holder's signed approval on its head or the holder's newest finding with no head committed after it, the PR watcher shall give the task to the author with status `todo` and wake them, with the comment "PR watcher: back to <author> after review, head `<sha>` (HAL-21150)." and a line linking the pull request, at most once per verdict (the approval, or the finding by its id), counting it in the pass summary as `handedBack` and in the metric `pr_watcher.handed_back`; a task in `backlog` or `blocked` doesn't move.

Any signed approval of the holder's counts, also one outside their scope, and any finding the watcher reads as one (`latestReview`): either ends the holder's turn. An approval that can't count goes back to the author, whose task the watcher then hands to the reviewer who can approve (`paperclip.pr-watcher-handoff`). A queue that drops an approved pull request needs nothing more: the approval already gave the task back.

When every pull request of such a task merged and landed green, the PR watcher shall decide as if the author held the task: mark it done when the author's rules close it (no open child task, no hold line after the merge, no comment after the merge, the close guards), and otherwise give it to the author as above, with "after the merge" and the marker of the comment-after-merge wake it answers; a task in `backlog` or `blocked` is only marked done.

## Examples

- Given pull request 5701 by Mateo with Julian's signed approval on head `5701aaa`, its task held by Julian with no run,
  when the watcher runs twice,
  then the task goes to Mateo with `todo` once, with the comment "PR watcher: back to Mateo after review, head `5701aaa` (HAL-21150)."
- Given Nora's finding with no head committed after it, the task held by Nora,
  when the watcher runs,
  then the task goes to Mateo.
- Given the task back with Julian after the watcher already gave it back for finding `i1` on the same head,
  when the watcher runs,
  then nothing moves for `i1`; with Julian's new finding `i2`, the task goes to Mateo again.
- Given Julian's approval on an older head, a finding older than the head, a draft, or Julian's run going on the task,
  when the watcher runs,
  then the task stays with Julian.
- Given the pull request merged and landed green, the task held by Julian,
  when the watcher runs,
  then the task is marked done; with a comment after the merge, it goes to Mateo instead, once.
