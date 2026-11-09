# Decision: `app.outside-run-connector-gate` hands the host the error of unreadable settings

- Requirement: `app.outside-run-connector-gate` (`packages/core/app/requirements/outside-run-connector-gate.md`)
- Task: HAL-1769, from the review of the HAL-1531 stack (HAL-1764)
- Approval: [HAL-1769](/HAL/issues/HAL-1769) asks for this change; the maintainer approves it in review
- Kind: internal

## What changes

The requirement gets one more rule; nothing it promised before is taken away. When a connector's
settings can't be read, the gate's refusal carries the store's error apart from the reason, for
the host to log and show the person. The reason stays the one `ConnectionSettings` gives, which
never repeats the error.

## Why

`app.connection-settings` already says the host gets this error, and `checkSending` returns it, but
the gate dropped it, so a call from chat could never surface it. The error stays out of the reason
because it can name paths in the user's profile, and the reason goes back to the model.

## Covers

- `packages/core/app/requirements/outside-run-connector-gate.md`

No test was weakened. One test was added under `app.outside-run-connector-gate` in
`packages/core/app/src/outside-run-gate.test.ts`.
