# Decision: the Merger wake starts a heartbeat-like run that runs a pass, instead of a wake on the Merger's task

- Task: HAL-19234
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19234 (the board's check of the first woken run, 26 Nov 14:32 UTC, and Chief's ask on the task at 14:33 UTC; Liam approves this note in review)
- Kind: internal

`paperclip.merger-wake` changes how it wakes the Merger. It no longer wakes the holder of `mergerWake.task` through that task. It starts a run of that holder with no task (`agents.invoke`), as the Merger's heartbeat does. The run's prompt names the changes and asks for one pass, as on a timer heartbeat.

- Why: the first woken run after install (26 Nov 14:21 UTC) had the right responsible user and no credential error, but it never ran `pass.js`. A wake on a task makes a run about that task (HAL-16115, the Merger's setup task), so the agent read some status and stopped. A run with no task gets the same responsible user as a timer run (the company default, as before), and the prompt makes it run the pass.
- Also from Liam's review of #6407: a pass now checks the 45-second spacing and whether the Merger is busy before it reads GitHub, and a failed wake keeps its changes for the next one.
- Also from the board (26 Nov 14:38 UTC): the woken runs took the Merger's only run slot and held off timer passes from 14:29 to 14:33 UTC. A wake must never hold off the timer pass, so it now also skips (and doesn't read GitHub) when the Merger's timer heartbeat is due within 30 seconds. A new example says so.
- The examples keep their meaning; the first and third say what is now checked (a wake with no task and a pass prompt, no GitHub read while busy).

## Covers

- paperclip.merger-wake
