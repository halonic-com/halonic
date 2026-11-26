# paperclip.pr-watcher-retargeted

- Status: active
- Since: unreleased
- Source: HAL-16394; #5007, #5008 and #5009 stayed blocked for about 7 hours on 22 Nov after GitHub moved their base to `main` (HAL-16392). HAL-17869; #5737 stayed blocked for about 2 hours on 24 Nov because its task was in `backlog`. HAL-18147: a parked task is done once its pull requests landed, and is woken for a held head. HAL-19031: #6183 was retargeted at 20:25 on 25 Nov while its reviewer held HAL-18625, and stayed blocked until 01:01

When the PR watcher checks a task in `todo`, `in_progress`, `in_review`, `backlog` or `blocked` whose author holds it, or its reviewer (Liam or Julian, when not its author) holds it, and whose holder has no run going, the PR watcher shall comment on the task and ask Paperclip to wake its holder, once per pull request head, if one of its open pull requests, neither a draft nor in the merge queue, had its base changed to the repository's default branch, by hand or by GitHub after the old base branch was deleted, after it was last reopened, force-pushed or given a new head commit, and shall tell the holder to close and reopen it or push a commit.

For a task in `backlog` or `blocked`, apart from marking it done (`paperclip.pr-watcher-done`) and waking its author for a held head (`paperclip.pr-watcher-held`), this is the only thing the PR watcher shall do: it shall not wake its author for anything else, hand it to a reviewer or move its monitor, and for this wake it shall leave the task's status as it is unless Paperclip refuses to wake a task in that status, in which case it shall set the status to `todo` and wake the author.

GitHub runs a ruleset's required workflow only on `opened`, `synchronize` and `reopened`, and ignores the `types` a workflow lists, so a base change alone never runs it again and the pull request stays blocked with every check green. A stacked pull request's task often waits in `backlog` or `blocked` until the pull request below it merges, which is exactly when GitHub moves its base. The watcher compares with the reopen or push rather than with the note check, because the repository's own copy of `guard-notes.yml` also runs on `edited`, under the same name, without clearing the block.

## Examples

- Given an open pull request into `main` whose head commit is from 10:05 and whose base GitHub changed to `main` at 10:17:57 when the pull request below it merged,
  when the watcher runs twice,
  then it comments once, saying to close and reopen it, and the second run adds nothing.
- Given the same pull request whose note check ran again at 10:18 on the `edited` event of the base change, with no reopen or push,
  when the watcher runs,
  then it comments once, saying to close and reopen it.
- Given the same pull request after a reopen at 17:49, a force push at 17:49 or a new head commit from 17:49,
  when the watcher runs,
  then it does nothing.
- Given a pull request whose base changed to a branch other than the default branch,
  when the watcher runs,
  then it does nothing.
- Given a retargeted pull request that is a draft, or one in the merge queue,
  when the watcher runs,
  then it does nothing.
- Given the same pull request on Mateo's branch, its task held by its reviewer Liam,
  when the watcher runs twice,
  then it comments once and wakes Liam once, saying to close and reopen it; a new head wakes him again.
- Given a task its reviewer holds whose pull request is a draft, in the merge queue, or red and conflicting without a retarget,
  when the watcher runs,
  then it does nothing.
- Given a task in `backlog` or `blocked` whose author holds it, with the retargeted pull request,
  when the watcher runs twice,
  then it comments once and wakes the author once, and leaves the task's status.
- Given a task in `backlog` whose pull request merged and landed green, with a comment after the merge,
  when the watcher runs,
  then it neither marks it done nor wakes anyone.
- Given a task in `backlog` whose open pull request wasn't retargeted but has a red `ci-ok` and a conflict,
  when the watcher runs,
  then it does nothing.
