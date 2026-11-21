# Decision: an integration's sign-in works behind Studio's relay

- Approval: the task to build this is HAL-13427, whose description asks for this change and its security review by Liam and Julian; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XUqvO/dhrRSwab5E9zYwJH3L2kYYpon/X7HSM/XxOxDCmcj1o3UKknQcet35Ili7KzDTzOORkYp52caHoHUiAA==
- Task: HAL-13427

## What changes

The requirement `agent-host.integration-sign-in-routes` used to say that when the host serves over
frames (`--stdio`, Studio on Windows with WSL), a start of an integration's sign-in is refused with
`501 callback_unavailable`. It now says the redirect names the relay's port, the callback's `Host`
names it too, and Studio's relay passes the callback on without the launch token. `501
callback_unavailable` stays for the one case left: a request whose socket names no port.

The relay's own requirement (`studio.src-tauri.crates.agent-host.relay-callback`, draft) adds a
second path it passes without the token: `GET /sign-in/` and exactly 43 base64url characters, the
shape the host makes for each start, held to the same rules as Google's callback (whole head
first, no body, no upgrade, a query of at most 2 KiB, CRLF only, the same 4 places and deadlines).

## Why

Without it, a plugin's sign-in can't be used in Studio on Windows at all. The relay still passes
nothing but a callback's exact shape; the host still checks `Host`, `Origin`, the pending path and
the sign-in's `state` (with PKCE), as on its own port.

## Covers

- agent-host.integration-sign-in-routes
