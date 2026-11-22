# Decision: validate's missing workflow or agent for a routine says Studio's sentence and the fix

- Task: HAL-15758
- Approval: the task HAL-15758 asks for this change, from flow check C626 #5 (HAL-15750). The team decides it under the HAL-2282 rule, since it rewords a message that is already there to the words an approved screen uses. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ElZl48A+00Wxegizv52XNAYxH6aMW9um44OsZedOGV0Z9s+GIDy4MkGPh5wThPNIZBPKPScILzSQKjaw9twlAw==

## What changes

- `workspace.routines`: a routine whose `run.workflow` or `run.agent` names a workflow or agent its hub doesn't have now gets `Weekly report: weekly-reprot isn't in this workspace. Pick another workflow for run.workflow.` (or `agent` and `run.agent`) instead of the old loader's `Routine "weekly-report": unknown workflow "weekly-reprot"`. When an id of that kind is near, `Did you mean weekly-report?` follows; the agent message had that hint before, in quotes, and the workflow message gets it too. The codes stay `unknown-workflow` and `unknown-agent`, at the same key path and line. The requirement names this message as the one exception to `Routine "<id>": `, the two parity cases move out of the "old loader's error" example into their own, and one example is added for the near workflow.
- `packages/testing/parity/allowed-differences.json`: a new entry, `routine-target-missing-says-the-fix` (`proposed` until Liam signs it off in review), lists the old and new message for the two parity cases that reach this check, `routine/unknown-workflow` and `routine/unknown-agent`. The recorded fixtures are the old loader's output and stay as they are.

## Why

`halonic routines list` names the routine "Weekly report", says it can't start and points to `halonic validate`. There the line used the id, had no fix, and differed from Studio's routine page, which says "weekly-reprot isn't in this workspace. Pick another workflow." (`cantStartWords.targetMissing`). Now the three say the same thing, and validate adds the key to change, since the user fixes it in the file.

## Tests

No test was weakened or skipped. `routines.test.ts`: the two parity cases moved out of the "old loader's error" list into a test that checks the new message at the same file, key path and line, and a new test checks the near workflow. `references.test.ts`: the near agent test checks the new message. `allowed-differences.test.ts` lists the new entry's requirement; `parity.test.ts` passes with it.

## Covers

- packages/testing/parity/allowed-differences.json
- workspace.routines
