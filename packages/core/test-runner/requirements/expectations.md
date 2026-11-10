# test-runner.expectations

- Status: active
- Since: 0.1.0
- Source: the expectations of the old test runner (`packages/testing/test-runner`) at 784f78d, the failure sentences of `halonic test` (HAL-1981, section 3.3; HAL-2676, HAL-2690) and the HAL-4224 plan review

When a case's run has ended or stopped, the test runner shall check the case's `expect` against it and give one failure for each thing that doesn't match, in this order:

- `final`: the step the run is in isn't the expected one. It is not given when `states` or `status` failed too.
- `states`: the steps the run went through, in order, aren't exactly the expected ones.
- `status`: the run's status isn't the expected one, with the step it waits or failed in. `final` without `status` expects `completed`.
- `context`: one failure per expected field that doesn't match, by its dotted path. Objects match key by key, so the run may set more; arrays and other values must be equal. A field the run didn't set is reported as not set.
- `artifacts`: one failure per expected file the run didn't save, with every file it did save. Files the test doesn't list are never a failure.
- When the run failed and `expect` sets no status, the case shall fail with `error` and the run's error.

When a run of the case failed because a step would start a program (`harness-unavailable`), the case shall fail with `unscripted-program`, naming that step, and with no other expectation failure, because the run never got further.

## Examples

- Given `expect: { final: done, states: [extract, done] }` and a run through `extract, rejected`, then only `states` fails.
- Given `expect: { final: done }` and a run waiting in `approval`, then `status` fails: expected `completed`, actual `waiting` in `approval`.
- Given `context: { ticket: { status: closed, priority: high } }` and a run whose ticket is `{ status: open }`, then `ticket.status` fails with `open`, and `ticket.priority` fails as not set.
- Given `artifacts: [note.md, receipt.pdf]` and a run that saved `note.md`, then only `receipt.pdf` fails, saying the run saved `note.md`.
