# Decision: an agent routine says Can't start in the list, and a routine's page blames the engine only when it can't be reached

- Task: HAL-15607
- Approval: HAL-15607 (flow check C600 findings 2 and 3 on HAL-15594; wording built on the approved Routines list and routine page, decided by the team under the HAL-2282 rule). Liam signs this note at code review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/CCSoVnb9TNxTli3sMM8ylCVYyGI8BCcxBeGnkaUUaB3dJYylnWHlyPYEDcplWM+lAMkF44coBoCcZTdQRwnAQ==

## What changes

**A routine that starts an agent on its own** can't run yet, as its page says, but the Routines list
showed its next time and `halonic routines` said "Next tomorrow 08:00". Now:

- Studio's list row shows **Can't start**, the Starts card's sentence ("Halonic can't run an agent
  on its own yet, only as a step in a workflow. …") in place of the routine as one line, and no
  time, as it already does for a missing workflow or a file error.
- `halonic routines` says "✕ Can't start" in the Next column, with a line under the list in the
  words of `serve`'s webhook line: "! Daily digest can't start: Halonic can't run an agent on its
  own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the
  routine start that workflow." `--json` gives `nextRun: null` and a new field `startsAgent`, which
  core's routine list now gives. The exit code stays 0: the file has no error and `halonic
  validate` passes, and exit 1 points at `halonic validate`. In a workspace that isn't trusted
  here, such a routine still says "✕ Can't start", not "! Paused until trusted" (HAL-15525), since
  trusting the workspace wouldn't start it; it alone doesn't bring the line naming `halonic trust`.

**A routine's page whose read fails** said "The engine isn't answering. It may still be starting."
for any error without a reason of its own, such as the shell's git failing. It now uses the shell's
`engineReasonFor` (F13, HAL-11626): only an engine that can't be reached says it isn't answering,
in the words for where Studio runs; any other unexplained error says "Halonic ran into a problem it
can't explain yet." The desktop app also gives a history read that fails without saying why its own
reason: "This workspace's history can't be read, so Halonic can't tell which version of this
routine runs." A failure with its own reason keeps it. The routines feature's `EngineNotAnswering`
becomes the shell's class, so Run now's toast for an unreachable engine now says the
where-Studio-runs words as its doc comment always said ("The engine isn't answering. It may still
be starting." on the desktop, not "The engine isn't answering.").

## Requirements and tests

- `app.routine-list`: each routine also says whether it starts an agent on its own; one example.
- `cli.commands.routines.list`: "Can't start" and the line under the list for an agent routine,
  `startsAgent` in `--json`; one example. The golden files gain `"startsAgent": false`.
- `studio.workspace-routines-list-liveness`: the page's reason is the failure's own, or that the
  history can't be read, never that the engine isn't answering; one example. Its two tests that
  expected the raw error now expect the history reason with the error as its cause, and a new test
  keeps a reason of its own.
- `routines.page.run-now-failed`: the unreachable-engine example says the where-Studio-runs words.
  The run-now test and the routine page's Run now test change that one expected text.
- Draft requirements `routines.list.rows-and-states` and `routines.page.frame-and-states` gain one
  example each, with new tests.

## Covers

- app.routine-list
- cli.commands.routines.list
- studio.workspace-routines-list-liveness
- routines.page.run-now-failed
- apps/cli/src/commands/routines/golden/acme-routines.txt
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
