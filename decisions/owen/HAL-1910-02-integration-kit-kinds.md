# Decision: the integration kit's errors carry an error kind

- Requirements: `integration-kit.integration-entry` (`packages/adapters/integration-kit/requirements/integration-entry.md`) and `integration-kit.run-tool` (`packages/adapters/integration-kit/requirements/run-tool.md`)
- Task: HAL-1910, error kinds for the integration kit (plan section 4)
- Approval: the task asks for the change; the maintainer approves this note in review

## What changes

Both requirements gain to what they say. Nothing they promised before is taken away.

- `integration-entry`: the published entry may now also import `@halonicjs/std/error-kind`, a
  single file with no imports of its own, for the `ErrorKind` type. It still brings no outside code
  into an integration.
- `run-tool`: `makeError` gets a third argument, the error kind (`not_found` for `not-found`,
  `invalid_input` for `bad-arguments`). A `makeError` written before ignores it and keeps working.
  The codes `not-found` and `bad-arguments` stay as they are; whether to respell them is the
  maintainer's call.

The new requirement `integration-kit.error-kinds` gives `IntegrationRefusedError` and
`IntegrationTimeoutError` their kinds.

## Tests

No test was weakened or removed. `entry.test.ts` allows the one extra import, and the two
`run-tool.test.ts` cases that check a refusal also check its kind. New tests cover the kinds and an
old-style `makeError`.
