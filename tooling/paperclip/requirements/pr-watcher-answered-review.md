# paperclip.pr-watcher-answered-review

- Status: active
- Since: unreleased
- Source: HAL-18460 (the board, 25 Nov: a pull request with changes requested waited for its author to hand it back by hand; target an answer within about 30 minutes)

When the PR watcher checks an open task whose author holds it with no run going, and a pull request of the task has an open review finding, and the author answered it, either with a head committed after the finding or with a task comment after it while no monitor of theirs is due within the hour, and every open pull request of the task is otherwise ready as in `paperclip.pr-watcher-handoff` (out of draft, mergeable, and green or approved), the PR watcher shall comment once per finding and head, naming the answer ("#N: answers Liam's change request: a new head `abc1234` pushed after it."), and give the task with status `todo` to the reviewer who asked: Liam when the finding names Liam, otherwise the reviewer by the path rules, and Julian or Liam for each other's and Liam's own pull requests as in `paperclip.pr-watcher-handoff`. The GitHub snapshot shall keep the reviewer a finding's opening names and when the head commit was committed.

## Examples

- Given pull request 5701 with Liam's "changes requested" at 15:00 and a head committed at 16:00 with a green `ci-ok`, and the path rules saying Julian,
  when the watcher runs twice,
  then it gives the task to Liam once, with "#5701: answers Liam's change request: a new head `5701aaa` pushed after it."
- Given Julian's finding and the author's task comment after it, with only a 6-hour fallback monitor,
  when the watcher runs,
  then it gives the task to Julian; with the path rules saying Liam, after a push, to Liam.
- Given the author's comment after the finding while their monitor is due in 20 minutes, no push and no comment after the finding, or a push whose `ci-ok` is running or red,
  when the watcher runs,
  then it leaves the task with its author.
- Given a recorded pull request whose head commit was committed at 13:50,
  when the snapshot is taken,
  then it keeps that time, and Julian as the reviewer of its "changes requested" finding.
