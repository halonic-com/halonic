# Decision: routine run ids name proposal refs

- Approval: found in Nina's docs check (HAL-12361) and fixed on HAL-12383; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:m74orrpOMK833bBiM1vNwcacevuBAVsDTCZcgVUeJk5fo1OYEjp/fEhDqfbY5KptGACCB3Mkhv2dn9DP2LdSBQ==

## What changes

`routineRunId` made ids such as `routine-9f67cab0a2a7258c-20261103T080000.000Z-a9686c3d856d20f5`.
Every run's proposal is kept under the ref `refs/halonic/proposals/<run id>`, and `checkProposalRef`
takes only letters, digits, `-` and `_` there. So after every routine run the engine reported "the
engine couldn't clean up after a harness run: Invalid proposal ref …" (`halonic routines watch
--debug` showed it), and a routine whose workflow runs a harness agent that writes files could not
open its worktree.

The due time in the id now leaves out its milliseconds: `20261103T080000Z`. Routines are due on
whole minutes, so nothing is lost, and the hash at the end still covers the whole time. The id is
58 characters for any key. Everything else stays: the same workspace, routine and due time give the
same id, the `routine-<workspace hash>-` prefix is the same, and the short id (the last 6
characters) is the hash.

`app.routine-scheduler` now says run ids also name a run's proposal ref; its long-key example says
"letters, digits and `-`" and 58 characters.

## What it costs

A routine run started before the update and asked for again after it gets a new id, so it would
start a second time. That only happens when an engine stopped between starting a run and storing
the last tick, and was then updated before the next tick: the next tick of a running engine asks
only for times after its last tick. A run still going is found by the unchanged prefix, so overlap
rules hold across the update.

## Tests

`routine-ids.test.ts`: the long-key test also checks every id against the port's own
`checkProposalRef`, which fails before this change, and the length is 58. The pinned ids of "keeps
the run ids … it gave before" are the new ones.

## Covers

- app.routine-scheduler
- packages/core/app/src/routine-ids.test.ts
