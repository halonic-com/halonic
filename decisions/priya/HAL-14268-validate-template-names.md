# Decision: the keys a step can read include every key the engine writes

- Approval: HAL-14268
- Kind: internal

## What changes

`contextBefore`, the keys a step can read, now counts every key an earlier step writes when it runs, as the engine writes them: its `output` (as before), its `conversation`, the name of each branch of a parallel step, and `lastEvent` for a wait step. Before, it counted only `output`.

`workflow.context-before` says so, and its loop example now gives `draft` and `lastEvent`, because the loop goes through a wait step. Its test case changes the same way, and a new case covers conversations and branches.

## Why

The new `unknown-template-name` check (C337 C10) uses these keys to refuse a misspelled `{{context.<key>}}` as an error. With only `output`, a correct `{{context.lastEvent.comment}}` after a wait step, or `{{context.<branch>}}` after a parallel step, would be refused, and a run that works would no longer start. The existing `unknown-gets` check had the same false error for `gets: [context.lastEvent]`; it goes away too.

## Tests

No test was weakened or skipped. One test of `contextBefore` expects `lastEvent` in its loop. One for-each test in `validate.test.ts` now gives the workflow the `list` its `{{context.list}}` reads, so it still finds only `foreach-without-work`.

## Covers

- workflow.context-before
