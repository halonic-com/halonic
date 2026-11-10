# Decision: a `programs` key for scripted program results in workflow tests

- Approval: the [HAL-4248 proposal](/HAL/issues/HAL-4248#document-proposal), approved by Liam on HAL-4258
- Kind: internal
- Task: HAL-4248

## What changes

Each workflow test case gains an optional `programs` key: scripted program results per agent
id, used in order. A result is a string, `{ output: <value> }` or `{ fails: <message> }`. The
key is optional with no default filled in (as in HAL-189-03), so a parsed older file is exactly
as before and the `format.workflow-test-file` defaults test doesn't change. The workflow test
spec file (`spec/workflow-test.schema.json`) gains the one property; no existing property
changes. The old schema in the parity fixtures never has this key, so parity is unchanged.

## Why

Tests never start programs, so a step whose agent sets `harness` failed its case with
`unscripted-program` and there was no way to script its result. The engine handles a program's
result as one value, like a model reply, or as a failure, so the three forms cover it.

- **Keyed by agent id, like `mocks`.** A `foreach` state (and later `parallel`) can start the
  same agent's program more than once; a list per agent covers that, a key per step doesn't.
- **A separate key, not `mocks`.** A mock reply is text only and can't script a failure.
- **`{}` is refused** (Liam, HAL-4258): `output` must be present, so an empty result can't
  quietly script an empty output.
- **Order** is the order the engine starts the programs (Liam, HAL-4258): item order in a
  `foreach`. A `parallel` branch can't run a program on `main` yet (the engine fails the run,
  which the proposal and review missed); once it can, branches start in name order
  (`branchesOf`), not file order. The requirement says so and the runner's tests pin it.

The runner side (using the results, the `unused-program-results` failure) lands in
`core/test-runner` after HAL-4215's runner PR.

No test was weakened or removed.

## Covers

- format.workflow-test-programs
- packages/core/format/spec/workflow-test.schema.json
