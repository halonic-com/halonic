# paperclip.pr-watcher-held

- Status: active
- Since: unreleased
- Source: HAL-18147; the board supervisor and Chief on HAL-17912 (25 Nov 03:28 UTC): the culprit of a failed merge group wasn't told, so the watchers' stop-gap (`culprit_held`) did it until this

When merge control holds a pull request's head after its merge group failed (`paperclip.merge-control-culprit-hold`), the plugin shall keep the failed run's address, its failed jobs' names and the first failure annotation title that says more than an exit code with the hold, and drop them when the hold ends; and when the PR watcher checks a task in `backlog`, `todo`, `in_progress`, `in_review` or `blocked` held by the agent its pull requests' branches name, with no run going, whose open pull request's current head merge control holds, it shall set the task to `todo` unless it already is, comment naming the failed jobs, the run's address, the error line when one was kept and what to run, and ask Paperclip to wake the author, once per held head.

The watcher reads the holds from merge control's stored state, so it sends no GitHub request for them. A hold set before the run was kept names no check, so it wakes nobody.

## Examples

- Given pull request 42 whose head merge control holds after its group failed in `Test (core)` with the annotation "Expected 3, received 4", and its task in `blocked`,
  when the watcher runs twice,
  then the first run sets the task to `todo`, comments naming `Test (core)`, the run's address and the error line, and wakes the author, and the second run adds nothing.
- Given the same hold without a readable error line, and the task in `todo`,
  when the watcher runs,
  then it comments naming the check and the run, with no error line, and leaves the status.
- Given the author pushed a new head to pull request 42,
  when the watcher runs,
  then it wakes nobody for the old hold.
- Given the task held by its reviewer,
  when the watcher runs,
  then it wakes nobody.
