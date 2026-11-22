# Decision: routines watch leaves out a routine whose file has errors and starts the others

- Approval: the task HAL-15372 asks for this change, from flow check C565 row 1 (HAL-15351), with option 1 as the preferred fix; the team decides it under the HAL-2282 rule, the wording builds on the list's approved "Can't start", and Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:masb2eGM1BbR2iXnthT/vlkx6uTFEm/PxIysiWUkaJ0KGEwQABdDrYhgeMs7mXD72s7tSV3omNU3CTfsMPfOBQ==

## What changes

- `cli.commands.routines.watch`: a routine whose own file has errors is left out on every tick, with "✕ Friday digest can't start · halonic validate" printed once until its file is fixed; the other routines start. An error in any other file still stops the watch with exit 2. The example "a routine whose workflow isn't in its hub … didn't start when it is due" is replaced by two: the broken routine is said and left out at the start, and starts from the tick after its file is fixed. `halonic validate` reports a missing workflow on the routine's file, so that routine never reached its due time since HAL-6613.
- `cli.workspace-file-problems`: `routines watch` counts only the errors outside the routine files. One example is added. `run`, `runs send`, `test` and `doctor` are unchanged.
- `cli.commands.serve.serve` and `cli.commands.serve.webhook-refusals`: the ✕ line under a webhook routine's address says "can't start" instead of "won't start", the word `halonic routines` and the Studio use (HAL-15082).
- The `cli.workspace-file-problems` test in `routines/watch.test.ts` now breaks a workflow file instead of the routine's file, since the routine's file no longer stops the watch; it still expects exit 2, the same two lines and an empty run log.

## Why

`halonic routines` lists the broken routine as "Can't start" and the healthy one with its next run, and says routines start only while `watch` runs. `watch` then refused the whole workspace, so the promised run never happened. The Studio's page engine has no such refusal: it starts the healthy routines and the broken one fails at its own start. Leaving out only the broken routine makes the CLI match both.

The refusal exists because a file left out for an error could hide a provider and make the workspace look as if it reached only the test model (HAL-6613). A routine's file adds nothing to the trust content (connectors, agents in a harness, local integrations, providers), so leaving one out can't change the trust decision. Errors in any other file keep stopping the watch. The trust check without the file refusal stays private to `run/trust.ts`; the watch calls `checkRoutinesTrust`, which always refuses the other files first.

## Tests

No test was weakened or skipped. `routines/watch-cant-start.test.ts` adds two tests: a broken Friday digest next to Hourly follow-up prints the ✕ line, "Watching 1 routine", and starts only Hourly follow-up at 15:00; after the file is fixed while watching, both start at 15:00. The first fails on `main`, where the watch exits 2. The refusal test keeps its expectations with an error in a workflow file. The serve tests expect "can't start".

## Covers

- cli.commands.routines.watch
- cli.workspace-file-problems
- cli.commands.serve.serve
- cli.commands.serve.webhook-refusals
