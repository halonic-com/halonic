# Decision: an agent file's JSON schema gains the `chatUi` block

- Task: HAL-17646
- Approval: OpenUI plan approved by the board on 23 Nov (HAL-17107, document `plan`); the agent setting as proposed in Liam's technical review on HAL-16863. Liam approves this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bqpZUQDWRBsrXmi0rS8WJVk+9WXgFi5wyCCnC2QGiKncd6GMtaDy4ncZDTmr1Fd9Q5L/v4+Cq2n6OXIFVIszDA==

## What changes

OpenUI Part A lets an agent opt in to components in its Studio chat replies. The agent file gains
an optional `chatUi` block (requirement `format.agent-chat-ui`, new in this change): one field,
`components`, a list of `card`, `table`, `form` and `buttons`, at least one, each once. Left out,
components are off.

The golden JSON schema of an agent file, `packages/core/format/spec/agent.schema.json`, gains the
same block. Nothing in it is removed or loosened, and no test was weakened or skipped.

## Covers

- packages/core/format/spec/agent.schema.json
