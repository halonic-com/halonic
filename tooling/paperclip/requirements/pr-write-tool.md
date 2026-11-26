# paperclip.pr-write-tool

- Status: active
- Since: unreleased
- Source: HAL-18983, token plan Track B (HAL-18938): one call opens or updates a pull request, and one closing call marks it ready and hands the task on, instead of `gh pr create`, `gh pr edit`, `gh pr ready` and the curl writes

When an agent calls the Agent tools plugin's `write_pr` tool with its own branch (`<agent>/HAL-<n>-<words>`, the agent being the caller), the plugin shall find the branch's open pull request on halonic-com/halonic with the read token and either open one against `main`, a draft unless `state` is `ready`, with the `built-on:paperclip` label and a `Built-on: paperclip` line added to a body that names none, which needs a title and a body, or change only the title, body, built-on labels and draft or ready state the call names, sending nothing for what already is as asked. When an agent calls `set_next_step` or `finish_run` with `readyPr`, the plugin shall first mark that pull request ready, only when its branch is the caller's own, and change the task only after that succeeded. Either shall refuse, before any write, a branch or pull request of another agent, a label other than the built-on ones, and opening without a title and a body.

## Examples

- Given Priya's pushed branch `priya/HAL-18983-pr-write-tools` without a pull request,
  when Priya calls `write_pr` with a title and a body,
  then the plugin opens a draft against `main` with the body ending in `Built-on: paperclip` and adds the label `built-on:paperclip`.
- Given that branch's open draft #6300,
  when Priya calls `write_pr` with a new title and state `ready`,
  then it changes the title and marks #6300 ready, and nothing else.
- Given labels `["fast-track"]` or the branch `liam/HAL-1-other`,
  when Priya calls `write_pr`,
  then it answers with an error and writes nothing.
- Given Priya's draft #6400,
  when Priya calls `finish_run` with outcome handoff to Liam and `readyPr: 6400`,
  then #6400 is marked ready first and the task then goes to Liam with status `todo`.
- Given GitHub refuses the ready step,
  when Priya calls `finish_run` with `readyPr`,
  then the answer is the error and the task doesn't change.
