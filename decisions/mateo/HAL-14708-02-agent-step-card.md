# Decision: the agents host reads an agent step's output and tools

- Task: HAL-14708
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14708 (follow-up of Noah's design check C462-6 on HAL-14703: the approved agent step card, flow-agents 7, shows output and tools); Liam reviews the pull request on HAL-14708 and signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FhMTZCZz6fAfGW/UB/QHNUDMAN/F4nRmAs03qE95dTETAVepzLob71O4kgCqaLfZVeYvyjVu3oEDvuva6qrSBg==

## What changes

`studio.workspace-agents` grows by one promise. `WorkspaceAgents` now also reads, for each agent
step (`methods`), the field names of its JSON answer (none when it answers in text) and its
`tools` as the file gives them (none given when the file leaves them out, an empty list for
`tools: []`). Its example names them. Nothing already in the requirement is removed or weakened.

## Why

The agent step card shows **Output** and **Tools** (flow-agents 7, C462-6), and the card can only
show what the host gives it.

## Tests

No test was weakened or skipped. The host test reads a step with JSON fields and tools and one
with `tools: []`; the card tests check "subject, body", "send-mail", "Text", "All of Writer's
tools" and "None".

## Covers

- studio.workspace-agents
