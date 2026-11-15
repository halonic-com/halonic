# Decision: the relay lets one token-free request through, the Google sign-in callback

- Approval: HAL-10017 (Liam, CTO; plan Revision 2)
- Kind: internal
- Task: HAL-10028

The relay's rule that a first request without the host's token is closed within 10 seconds gets one
exception: `GET /v1/google/callback`. It is held to its own, stricter limits.

## Covers

- `studio.src-tauri.crates.agent-host.relay-limits`

## What changes

- The sentence in `relay-limits.md` that says the relay closes a connection whose first request has
  no token within 10 seconds now names the exception and points to the new requirement
  `relay-callback.md` (its own file, so nothing else of `relay-limits.md` is edited).
- A connection whose first request is exactly `GET /v1/google/callback` (query of at most 2 KiB) is
  passed to the host without the token, as one request with no body: the relay forwards only the
  head, closes with the host's answer, allows 4 such connections at once, a 5 second head deadline
  and a 30 second lifetime.

## Why

Google's browser redirect carries no token, so the relay closed it before the host saw it. Without
this exception the Windows shell can't finish a Google sign-in in relay mode. The host still
checks `Host`, `Origin` and `state` itself; the relay only narrows what reaches it. See the plan in
HAL-10017 and Julian's security read in HAL-10026.

## Known gaps

- Any local process can open the callback or fill its 4 places for 5 seconds at a time. A sign-in
  then fails and the user retries; the connections with the token are not affected.
