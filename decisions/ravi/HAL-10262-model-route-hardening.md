# Decision: harden the agent host model route (own ports, chat cap, abort on drop)

- Approval: Liam reviews this on HAL-10262
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:UPlWqKlTNvfQJ9POI9gVBWAvF0uT9XkB2EEv1n95zf2Gmowqs3M/OO2Q3RtoeGHtkMQa/j/hVa6NGNmD9VVxBw==

The agent host model route refuses provider URLs that point at Halonic's own ports, runs at most two chats at
once (a third gets `429`), and aborts the model call when the window drops the connection. The workspace root
check is now one shared helper. This note covers the edits to the active requirement
`agent-host.model-routes` that describe these rules.

## Covers

- agent-host.model-routes
