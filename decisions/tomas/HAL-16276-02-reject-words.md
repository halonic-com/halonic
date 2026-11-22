# Decision: after a rejection the CLI says "You rejected" and names the ending, as the run page does

- Approval: the task HAL-16276 asks for this change, from Iris's flow check C692 on HAL-16271 (item 4); the words are the run page's (`runs.run-view.receipt-ending`, a team decision on HAL-14592) and `runs show`'s, decided by the team under the HAL-2282 rule; Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BTkDCwOhxNpBFhdeiYaBeYJaeAcOOab7PYihPEdd2Cg7mDq3fovbqKAvZ8w25pEiDdSm6UWlVy6YuoHk18iVBA==

## What changes

- `cli.commands.runs.send`: for the event `reject`, the line after sending reads "✓ You rejected run <short id>. <title> goes on.", the verb `halonic runs show` gives the answer ("you rejected at 15:17"). Every other event keeps "✓ Sent <event> to run <short id>. <title> goes on.". One example is added; none removed or changed.
- Two golden files, `run/golden/support-reply-approved.txt` and `runs/golden/support-reply-output.txt`, gain one line each, "Ending: Finished with the reply approved", under the receipt of the finished Support reply run, as the new requirement `cli.run-ending` says. Nothing else in them changes.

## Why

After `halonic runs send <id> reject` the CLI said "Sent reject to run … Support reply goes on." and then only "✓ Support reply finished", so a rejected run read like one that went through. The run does go on (a workflow may route a rejection anywhere), so "goes on" stays, but the line now says what the person did, and the finished run names the ending it reached. The `runs` list keeps "Done", as the run page's badge does (HAL-14592).

## Tests

No test was weakened or skipped. `send-follow.test.ts` gains a reject case (the line and the Ending line); the new `show-ending.test.ts` covers `cli.run-ending` (ending by description, by id, none for one final state). The two goldens gain the Ending line.

## Covers

- cli.commands.runs.send
- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/runs/golden/support-reply-output.txt
