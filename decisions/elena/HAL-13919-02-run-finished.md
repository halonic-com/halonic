# Decision: the decided line says "The run finished." when the answer ended the run

- Task: HAL-13919
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13919 ("The run finished." decided by the team under HAL-2282 in the task's description, a detail of the approved card; Liam signed the two wording details for a run that ended another way and for a rejected tool call that ends the run in his review on the task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:t/EdGBFopJVnhl/EvvORBbhcPXXDrR7q0+gQIhG2yJeYNM8WMBesLDDdlDsVs2GyIzUfoUQViMzNB87aF/NbDg==

## What changes

`inbox.wait-card`: after an approve, the decided line says what the run did with the answer, as
the run reads once the answer is recorded: "The run continues." while it goes on, "The run
finished." when the answer finished it ("Approved by you at 10:44. The run finished."), and
nothing after the time when it ended another way (it failed, or couldn't try). A reject still
says nothing more. An example for Acme's `review` step, whose approve moves the run to its final
step, is added.

`inbox.approval-card`: the same rule. "Approved by you at 10:44. The run finished." when the
answer finished the run. A Reject that ends the run drops "The agent is told, and the run
continues." and reads "Rejected by you at 10:44. This tool call didn't run. The run finished.";
a run that ended another way gets the same lines without "The run finished.". A run that goes on
keeps the existing lines.

Nothing else in either requirement changes, and no example is removed.

## Why

Since the window can answer runs (#3913), Approve on Acme's "Approve this reply?" ended the run
(`run.completed`, Done in Runs) while the decided line still said "The run continues." (C267 AN2).
The line now tells the truth about the run.

## Covers

- inbox.approval-card
- inbox.wait-card
