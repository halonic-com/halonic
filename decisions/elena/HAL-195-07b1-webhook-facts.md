# Decision: the Runs list names a web-request start

- Requirement: `runs.row-columns` (`packages/studio/features/runs/requirements/row-columns.md`)
- Task: HAL-195, PR 7b-1 (review and approval on HAL-8326)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-8326
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jtb/Y+FBYMx4MuBA9tu9QLC5oHOZavmDnUMSva+yRRtrPWcaT5y4dSpHqxGL9CAf3LPQ1Z1HSDdmNDB5O3M1Bw==

## What changes

The requirement gains one example: a run started by a signed web request (a
webhook trigger) reads "A web request arrived" in its Started by column, and a
screen reader hears "Started by a web request, 10:40.", in the words of the mail
and signal lines. Nothing existing is changed, loosened or removed. One test
was added.

## Why

A webhook trigger can now start a routine, so the list needs a name for it
instead of the "without a trigger" wording.

## Covers

- runs.row-columns
