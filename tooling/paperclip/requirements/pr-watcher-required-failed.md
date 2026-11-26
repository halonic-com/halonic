# paperclip.pr-watcher-required-failed

- Status: active
- Since: unreleased
- Source: HAL-19031, from HAL-17866 (board evidence 26 Nov 00:59 UTC): #6247 (`Guard notes` failed, no decision note) and #5953 (`Built-on label` failed) showed `ci-ok` success, so their authors reported them green while GitHub refused to merge them

When the PR watcher checks a task in `todo`, `in_progress` or `in_review`, held with no run going by the agent its pull requests' branches name or by their reviewer (Liam or Julian, when not the author), and one of its open pull requests that isn't a draft has a required workflow besides CI whose newest run on the current head failed, the PR watcher shall comment on the task and ask Paperclip to wake its holder, once per pull request head and workflow, whatever `ci-ok` says, naming the workflow, the failing job and what fixes it.

The required workflows are `Guard notes` (job `Decision note and the guard's own paths`) and `Built-on label` (job `built-on-label`). The watcher reads them from its snapshot's failing checks by the job's name, so it sends no extra GitHub request and needs no write rights (`paperclip.pr-watcher-read-only`). A task in `backlog` or `blocked` isn't woken for this (`paperclip.pr-watcher-retargeted`).

## Examples

- Given #6247 on Mateo's branch, out of draft, with `ci-ok` green and `Guard notes` failed in `Decision note and the guard's own paths`, its task held by Mateo,
  when the watcher runs twice,
  then the first run comments naming `Guard notes`, the job and "even with `ci-ok` green", and wakes Mateo, and the second run adds nothing.
- Given the author pushed a new head on which `Guard notes` failed again,
  when the watcher runs,
  then it wakes the author once more.
- Given #5953 with `Built-on label` failed in `built-on-label`,
  when the watcher runs,
  then it wakes the author and says to add the `built-on:paperclip` label; a draft with the same failure wakes nobody.
- Given a pull request with `Guard notes` failed whose task its reviewer Liam holds,
  when the watcher runs twice,
  then it wakes Liam once; the same task in `blocked` wakes nobody.
