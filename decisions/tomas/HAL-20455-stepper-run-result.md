# Decision: a stored one-`use`-block stepper request runs, and is answered for its block

- Requirements: `action-steppers.stepper-items`
  (`packages/studio/features/action-steppers/requirements/stepper-items.md`)
- Task: HAL-20455, the follow-up HAL-18517 named in the requirement (plan approved on HAL-20453,
  answer 2)
- Approval: Liam approves this note in his review of this pull request on HAL-20455
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KK4Gh2fGylRFUnmQzylCk+1jUUT8RIONQAdGrJTzvqLiBGXIJwOIsLDmm3QycNFleaKQLjWtYvDi+v7BVT5uDQ==

## What changes

`action-steppers.stepper-items` said a stored request of one `use` block opens "for review only,
with **Decline**, until the run writes a stored request's result per block (HAL-20455)". This is
that task, so the sentence now says what happens instead: the stepper runs the request as it runs
any action item, and answers for the request's one block. A run numbers the definition's steps,
while the Paperclip client writes `stepper-result` per block and refuses a step past the last
block, so `blockAnswer` folds the run's steps into block 1:

- failed as its first failed step failed;
- else succeeded with every step's kept fields, "done by hand" when the user did any step by hand;
- skipped when every step was skipped;
- no block for a declined or expired request, nor for a run stopped part-way with no failed step,
  since the port has no failure for "stopped".

The requirement's source line names HAL-20455, and a new example walks
`github.upload-social-preview@1` to "done by hand".

## Tests

No test was weakened or removed. In `stepper-item.test.ts` the first case's title says "answered
per block" instead of "for review only", and `runs` is now `perBlock` (with the opposite value),
since every action item now runs and only the answer differs. The case Liam asked for on #6792,
`[restartBlock, approveBlock]`, is back as its own case: the request format takes a
`server-session` block only alone, so it reads as "its request document can't be read", not
`notOneStepper`. `block-answer.test.ts` is new.

## Covers

- action-steppers.stepper-items
- packages/studio/features/action-steppers/src/review/stepper-item.test.ts
