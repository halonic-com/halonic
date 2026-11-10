# Decision: parallel branches run in name order, an allowed parity difference

- Approval: Liam (CTO, core owner) chose option 1 on [HAL-3703](/HAL/issues/HAL-3703); he signs off the allowed difference in review
- Kind: internal
- Task: HAL-3689

## What changes

Nothing in the engine. The `parallel` state already runs and logs its branches in name order
(HAL-1536). This makes that part of the contract: the semantics spec and `engine.parallel-state`
say so, two tests pin it, and the parity allowed-differences file lists it as
`parallel-branch-name-order`, status `proposed`.

## Decisions

- **Name order, not the file's order.** Runs keep their definitions as canonical JSON (HAL-186
  decision 5), which sorts keys. Keeping the file's order would add a special case to
  `definitionsOf`, the kept definitions and runs already kept in map form (option 2), or change the
  file format (option 3, a board question). The old runner never promised an order.
- **The difference is narrow.** It covers only the order of sibling branch entries inside one
  parallel state. The set of branches, each branch's own events, the results and the final output
  must still match exactly. When step 8 ([HAL-1541](/HAL/issues/HAL-1541)) builds the run compare,
  it attaches the fixture to this entry and allows no more than that.
- **No shared writes.** Branch names are keys of one map, so no two branches write the same context
  key; `output` is written once, after every branch. A test checks that the results are the same
  whichever branch ends first.
- **When to revisit.** If a step 8 fixture shows a result, not just the log, that depends on branch
  order, this entry no longer applies and the question goes back to Liam (option 2).

## Tests changed

Two tests added to `states/parallel/state.test.ts`; `allowed-differences.test.ts` lists the new
entry's requirement. No test was weakened or removed.

## Covers

- engine.parallel-state
