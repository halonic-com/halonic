# Decision: every routine that can't start is counted and says why, in the list and the watch

- Task: HAL-16096
- Approval: HAL-16096; team wording on approved command output (HAL-2282), from the flow check C672 #1 (HAL-16091); the reviewer signs this note as the CTO
- Kind: user-visible

## What changes

`halonic routines`:

- The first line counts every row that says "✕ Can't start" for a reason of its own, file errors
  or an agent on its own: "! 3 routines can't start. The lines under the list say why." It used
  to count only the routines with file errors and point to `halonic validate`, which doesn't list
  a routine that starts an agent, so the count and the rows disagreed.
- Each such routine gets one line under the list with its reason, its file's errors first: "!
  Missing flow can't start until its file is fixed · halonic validate", in the watch's words,
  so the command named lists that routine; or, without file errors, the existing line that
  Halonic can't run an agent on its own yet. A routine whose agent isn't in the workspace used
  to get only the agent line, telling the user to make a workflow, and one whose workflow is
  missing got no line at all.
- The lines for a fix that isn't committed and for webhook routines `halonic serve` won't start
  keep their own first lines, as before. The exit code doesn't change.

`halonic routines watch`:

- A routine that is on and starts an agent on its own is left out up front, with the list's
  line: "✕ Daily notes can't start: Halonic can't run an agent on its own yet, …". The engine
  refuses that run (`AgentRunsNotAvailable`), so the watch used to count it as watched and fail
  it when it was due. That reason comes before the harness reason, so an agent on its own in
  Claude Code gets it too, as the list gives it; a workflow's agent in a harness keeps the
  harness line.
- Routines that are on but in no file of the live version, which the watch doesn't run, are
  counted before its first line: "! 3 routines aren't live yet, so this watch doesn't run them.
  To start them, commit them or make them live in Halonic Studio." They used to be left out
  without a word.

The requirements `cli.commands.routines.list` and `cli.commands.routines.watch` and their
examples say the new lines. The list's tests expect the new first line and reason lines, and a
new test has C672's three routines. In the watch's tests, the harness test with an agent on its
own expects the agent line, the live-version test expects the count line, and the test for a ✕
line of a run that didn't start now gets there with a version nobody trusted, since an agent on
its own no longer reaches the start. The list's "Can't start" tests moved, unchanged apart from
those lines, from `list.test.ts` to `list-cant-start.test.ts`, which keeps both under the file
limit; so fewer tests run in `list.test.ts` and as many for the requirement. No test was
weakened or skipped.

## Why

C672 found that the list said "2 routines can't start" above three ✕ rows, sent a routine whose
agent doesn't exist to make a workflow, gave a routine whose workflow is missing no reason, and
pointed to `validate`, which doesn't name the agent's routine; and that the watch said "Watching
1 routine" and nothing about the three it didn't run.

## Covers

- cli.commands.routines.list
- cli.commands.routines.watch
- apps/cli/src/commands/routines/list.test.ts
