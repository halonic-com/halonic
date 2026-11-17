# Decision: the 4 billing/invoice parity tests pass on allowed differences, and the known gap goes

- Task: HAL-11746, found on halonic#3315 (HAL-11621)
- Approval: HAL-11746 asks for each difference to be fixed or allowed; Liam reviews the change and signs this note on HAL-11746
- Kind: internal

## What changes

The known gap `method-fields-in-file-order` is removed. Everything it hid is now explained:

- The artifact hash: the test runner's fake blob store gave a made-up hash (`000…03`); it now gives
  the SHA-256 of the content, as the real stores do. A fix, no allowed difference.
- The fields line of a method prompt: a new allowed difference `method-fields-by-name` (name order
  where the old runner used the file's order), the one HAL-4757 and HAL-7123 planned.
- The order of the parallel `checks` branches' events: the entry `parallel-branch-name-order` is
  widened. The engine starts every branch before any calls its model, so the events interleave;
  the compare now sorts both sides by branch name.
- Input tokens, cost and unpriced calls of the clerk's and notifier's calls: a new allowed
  difference `agent-system-message-size`. The engine builds those agents' system messages
  differently on purpose (`engine.run-agent-instructions`), so the compare takes only those
  figures out of those calls and out of the summary of a run that has one.

Both allowed differences and the widened one are `proposed` until Liam signs them off in review.

## Why the note covers parity.known-gaps-checked

`known-gaps.test.ts` makes one `expect` call per gap in `known-gaps.json`. With one gap fewer, the
requirement's tests make fewer calls, and the guard reports that. No test was changed or weakened:
the count drops because the file lists one gap fewer, which is what fixing a gap means.

## Covers

- packages/testing/parity/allowed-differences.json
- parity.known-gaps-checked
