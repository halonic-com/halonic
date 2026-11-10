# Decision: every reader of a run's status handles `cant-try`

- Requirements: `events.run-log-contract`, `engine.decide-refusals` and `test-runner.expectations`
- Task: HAL-4285 (PR 5b-1a of HAL-3277), with the test-runner part from HAL-4477
- Approval: [HAL-4285](/HAL/issues/HAL-4285), the CTO's choice of option A (the status lives in the run log)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3+0OOy3qPMLbhmGQcQV8o/tFaxWvx2h1E/slcrL00TbG5gsIVGj5GpafgTSMQjE7C/po+dukhHJcKGXza0y5Bg==

## What changes

A run can now end with the status `cant-try`: it stopped at a step it couldn't try, because the
step needs a change that is left out of the run. The new event `run.cant-try` and the optional
`cantTry` fields on `run.started` and `agent.finished` have their own requirement,
`events.run-cant-try`. The edited requirements only take them in:

- `events.run-log-contract` lists `run.cant-try` with the events added since the reference, and the
  two `cantTry` fields with the optional fields that came with the engine.
- `engine.decide-refusals` gives a run that ended with `run.cant-try` as an ended run, the same as a
  completed one.
- `test-runner.expectations` says a case can't expect `cant-try`. When `expect` sets no status, a
  can't-try run fails its case with `cant-try` and the steps it couldn't try; with a status
  expected, `status` fails with actual `cant-try`.

The two `halonic run` golden files show the run summary as JSON, which now has `cantTry: []`.

## Why

A run that didn't try every step must never read as `failed` (it didn't fail) or `completed` (it
didn't try everything), so every place that reads a run's status says what it does with it. Nothing
either requirement promised before is taken away: older logs read the same, with `cantTry: []`.

## Tests

No test was weakened. The new behaviour has its own tests in
`packages/core/events/src/run-cant-try.test.ts`, the `decide-refusals` tests and
`packages/core/test-runner/src/run/expectations.test.ts`.

## Covers

- `events.run-log-contract`
- `engine.decide-refusals`
- `test-runner.expectations`
- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
