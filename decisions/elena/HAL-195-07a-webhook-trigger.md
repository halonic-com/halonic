# Decision: a routine can start on a signed web request (`webhook` trigger)

- Task: HAL-195
- Approval: Liam approved the phase 4 build plan on HAL-7816 (PR 7: webhook triggers, additive); the package owner signs this note in review
- Kind: internal

## What changes

The golden `packages/core/format/spec/routine.schema.json` gains one more trigger shape,
`webhook: { secret, headers }`. Each header must be a lowercase HTTP header name (schema `pattern` `^[a-z0-9][a-z0-9-]*$`), listed once, and not one that carries the sender's credentials or that the server verifies (the format exports the list as `WEBHOOK_REFUSED_HEADERS`). Nothing in it is removed or loosened: every routine file that parsed
before parses the same. New requirements record the shape (`format.routine-webhook`) and how the
routines package treats it (`routines.webhook-trigger`). No existing requirement or test changes.

## Why

Webhooks are in v0.1 (plan D22). The format has to name the trigger before the host's server can
receive one. The secret is only a name; its value stays in the secrets store.

## Covers

- packages/core/format/spec/routine.schema.json
