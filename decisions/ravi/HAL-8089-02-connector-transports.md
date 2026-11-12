# Decision: a connector can name a local integration or a plugin backend, and is not local by default

- Approval: Liam approved the plan on HAL-8089 (option a: new connector transports, `local` defaulting to false); the package owner (Liam) signs this note in review
- Kind: internal
- Signature: pending (Liam)
- Task: HAL-8089

## What changes

The golden `packages/core/format/spec/connector.schema.json` gains two transports,
`integration: { folder }` and `plugin: { id }`. Nothing in it is removed or loosened: every
existing connector file reads as before. A new requirement, `format.connector-runner-transports`,
records the two transports and that such a connector is not local unless its file says
`local: true`. No existing requirement or test changes.

## Why

The run host needs a way for a hub to name a local integration or a plugin backend so the
existing per-run connector lifecycle can start it in the I5 runner. Their permission sheet can
name outside sites, so treating them as local by default would leak under `privacy.localOnly`.
