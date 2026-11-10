# Decision: a test case's agents get the knowledge sources they list

- Approval: the maintainer approves this note in review
- Kind: internal
- Task: HAL-4458

## What changes

`test-runner.run-tests` gains one part: a case's engine also builds the knowledge sources its
agents list, through the knowledge factories the caller gives in `TestDeps.knowledge`, and none when
it gives none. One example says what that gives the agent: `knowledge_search` and `knowledge_read`
over the source, and a `mode: auto` source's passages in its prompt before the first model call.
Nothing else in the requirement changes.

## Why

The old runner took the knowledge factories (the acme suite passed the `files` factory), so an
agent's `knowledge:` worked in a test. The new runner passed no `knowledge` option to the engine,
so an agent got nothing from it in a test, and a caller could only add tools by hand
(`halonicTools`). Found while porting the old suites (HAL-4448). `halonic test` passes the `files`
factory once one exists.

## Tests

No test was weakened or removed. Three tests are added under `test-runner.run-tests`.

## Covers

- test-runner.run-tests
