# routines.page.cant-run

- Status: active
- Since: unreleased
- Source: HAL-4291 (checklist 3.1, 3.4, 3.9); microcopy 23.3 "Can't run, routine"; `runs.sandbox-cant-run`. The words are placeholders until HAL-1784 is approved: reviewers check the keys.

When what a routine starts runs an agent in Claude Code or Codex (`startsProgram`), the page has **Run now** and the sandbox check refuses, the routine page shall show the can't-run Callout of `runs.sandbox-cant-run` at the top of its column, on the Schedule and Runs views alike, with no last line of its own, and **Run now** shall stay focusable but unavailable, described by the Callout's first line, on a phone too. A press on it starts nothing and asks nothing. The routine stays on: the Callout changes nothing in its file. When **Check again** finds the sandbox ready, focus shall move to **Run now**.

A routine whose target starts no program shall not be checked and shall show no Callout.

## Examples

- Given *Daily summary*, which starts a workflow with an agent in Claude Code, and a check that says `bubblewrap-missing`,
  then the page says "Daily summary can't run: the sandbox can't start on this computer.", then the fix, Check again and Read the guide, and Run now is unavailable and described by that first line.
- Given the same page and a check that now passes,
  when the person presses Check again,
  then the Callout goes and Run now has the focus.
- Given a routine whose workflow only uses Halonic's own agents, then nothing is checked and Run now works.
