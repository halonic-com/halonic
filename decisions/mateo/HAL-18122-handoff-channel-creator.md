# Decision: the hand-off limit counts a parent as a channel only when a person made it

- Approval: HAL-18122
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:Pei7yYlMjie2d9aC3wLNwTQZP4Dz7gwtcViCyMnqpzFXpfD67qokD+kuNw7XMlmqB6AjzHCOVtgNxI/jNc5JAQ==

The hand-off limit took any parent task with the `channel` tag as a channel's
parent, so an agent could put the limit on tasks by tagging a task it created.
The Paperclip provider (R2, `readChannel` in
`packages/adapters/paperclip-client/src/channels.ts`) makes a channel's parent
with the board's key and counts a parent only when `createdByUserId` is set and
`createdByAgentId` is empty. The plugin now uses the same marker, so the
requirement narrows from "carries the `channel` tag" to "carries the `channel`
tag and was made by a person, not an agent". The existing tests keep their
cases with a parent the board made, and a new test covers a tagged parent an
agent made.

## Covers

- paperclip.handoff-limit
