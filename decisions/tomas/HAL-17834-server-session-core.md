# Decision: a stepper request may hold one `server-session` block

- Task: HAL-17834
- Approval: Liam approved the plan's architecture on HAL-17834 (https://paperclip.halonic.com/HAL/issues/HAL-17834#comment-b42e8edb-b18b-4d13-aee1-0b5b600c3c9f), including this additive block kind, and Julian gave the security OK on HAL-17837; Liam signs this note in review
- Kind: internal

## What changes

The requirement `action-steppers.stepper-request` listed the block kinds a request may hold as
`use`, `step` and `browser`. It now also allows a request whose only block is a `server-session`
block, and points to the new requirement `action-steppers.server-session-request` for its rules.
The source line names HAL-17834. Nothing else in the requirement changes, and no test or golden
file is weakened, skipped or removed: the existing tests of `validateStepperRequest` all still
run unchanged.

It also adds one golden file, `server-session-cases.json`: the shared valid and refused cases for
the task id, host, user and port, read by the TypeScript tests here and later by the Rust tests
of the `server_session_open` command (HAL-17843), so both sides check the same cases.

## Why

The board asked for a "Run with Claude" button on server-session Inbox items (HAL-10, 24 Nov).
The approved plan on HAL-17834 marks such an item only by a `server-session` block in a pinned
`stepper-request` document, never by a label, so it gets the revision pin, the requester policy
and the validator the other blocks have. Liam asked for it to stay out of `stepperBlockSchema`,
which ToolScript's header reuses, and for the schema itself to make it the only block. The format
name and the document key stay the same, so there is no version bump.

## Covers

- action-steppers.stepper-request
- packages/core/action-steppers/src/golden/server-session-cases.json
