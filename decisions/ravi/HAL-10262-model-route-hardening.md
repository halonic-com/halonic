# Decision: harden the agent host model route (own ports, chat cap, abort on drop)

- Approval: Liam reviews this on HAL-10262
- Kind: internal

The agent host model route refuses provider URLs that point at Halonic's own ports, runs at most two chats at
once (a third gets `429`), and aborts the model call when the window drops the connection. The workspace root
check is now one shared helper. This note covers the edits to the active requirement
`agent-host.model-routes` that describe these rules.

## Covers

- apps/agent-host/requirements/model-routes.md
