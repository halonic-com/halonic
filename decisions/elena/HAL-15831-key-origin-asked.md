# Decision: the run log says "Allow this address?" in words, and a later event no longer hides the wait

- Task: HAL-15831
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15831 (flow check C638 #5 on HAL-15825; small wording on the approved "Allow this address?" flow, decided by the team under HAL-2282, no board card); the reviewer signs this note with the pull request
- Kind: user-visible

## What changes

1. `runs.run-view.key-origin-asked` (new): the run log view shows a `key-origin.asked` event as one line in words,
   `Asked whether provider "Gateway" may send key "gateway-key" to https://gateway.example.com.`, as it already does
   for the answer (`runs.run-view.key-origin-answered`). Before, the question was a raw event line right above its
   answer in words. The words follow the answer's line: the provider, the key's name and the address as saved,
   hidden characters escaped.
2. `runs.run-view.key-origin-waiting` (changed): the step showed "Waiting for your answer" only while
   `key-origin.asked` was the log's last event, so any later event hid the wait while the dialog was still open.
   Now a question stays open until its answer for the same key and address, or until an event shows the call may
   have ended without one: the step's own agent starts again (`agent.started` without `parent`), any agent
   finishes, or the run enters a step or starts to wait. Other events, such as a subagent's model call or a tool
   call in the same step, leave it open. A subagent's `agent.finished` closes the question too, because a
   subagent whose question timed out finishes with an error, and showing a wait with no dialog on screen would
   send the person looking for one; the cost is that a parallel subagent finishing can hide another's question.
   Nothing about a run that has ended changes: it still shows no wait.

No test is weakened: the three existing tests of `runs.run-view.key-origin-waiting` pass unchanged, and four new
ones cover a later event, a second question, the agent starting again and an agent finishing. The question and the
wait haven't been released, so there is no changeset.

Not in this change: the Runs list row. It is built from the run's summary alone (`runStanding` in `@halonicjs/app`),
which knows nothing of the question, so a run that waits for "Allow this address?" still reads Running there.
Showing Needs you needs a new summary field in `@halonicjs/events` and a change to `runStanding`, which the CLI's
`halonic runs` shares; that is planned on HAL-15831 for Liam's approval first.

## Covers

- runs.run-view.key-origin-waiting
- packages/studio/features/runs/src/run-view/key-origin-wait.test.ts
