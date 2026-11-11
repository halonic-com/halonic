# Decision: the test runner uses a case's `programs`

- Approval: the [HAL-4248 proposal](/HAL/issues/HAL-4248#document-proposal), approved by Liam on HAL-4258; his note on HAL-4313 (a blank `fails` message)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FElvgFVFVQdm0HrcgQAWVlPJ4OR/86I0rT0JguYBth2yt3PMSxo6jlBrYzlMiVRPjVAQN9OvZNdz9Oh1VfdODA==
- Task: HAL-4248

## What changes

- **`test-runner.scripted-programs` (new).** The runner passes the engine scripted harness ports:
  each start of an agent's program takes that agent's next `programs` result, a sandbox that is
  always ready and starts nothing, and a bridge that serves nothing. A leftover result fails the
  case with `unused-program-results`.
- **`test-runner.expectations` (edited).** `unscripted-program` was told by the run's
  `harness-unavailable` reason, which only happens when the engine has no harnesses. The runner now
  always passes them, so it tells an unscripted start by the scripted harness's own record, and the
  failure names the agent too. The rule itself (only that step, no other expectation failure) is
  unchanged.
- **`test-runner.run-tests` (edited).** "and no harness" becomes "and programs that answer from the
  case's `programs`".
- **`format.workflow-test-programs` (edited).** `{ fails }` refuses a message that is only spaces,
  as Liam asked on HAL-4313, the same `/\S/` rule as an integration scope's `reason`. The error
  code for `""` changes from `too_small` to `invalid_format`; the spec file's `minLength: 1`
  becomes `pattern: "\\S"`. The key hasn't been released, so no file in use changes meaning.

No test was weakened or removed: the format test gains a blank message, and the two
`unscripted-program` tests now also check the agent.

## Covers

- test-runner.scripted-programs
- test-runner.expectations
- test-runner.run-tests
- format.workflow-test-programs
- packages/core/format/spec/workflow-test.schema.json
