# Decision: gateway message version 4 adds the Inbox, Messenger and team status

- Approval: the board approved the phase 2 card on HAL-17544 (24 Nov); the protocol is section 2.2 of the architecture note on HAL-17511; task HAL-17634. Liam approves this note in review
- Kind: user-visible
- Signature:

The requirement `ports.remote-gateway-protocol` changes from message version 3 to 4. Nothing is weakened: sessions, approvals and prompts stay exactly as in version 3, and every version 3 example still holds except the version number.

- The phone may also send `msg-read`, `msg-search`, `msg-answer`, `msg-send`, `msg-watch`, `msg-unwatch` and `team-read`; the host may also send `msg-data`, `msg-result`, `msg-changed` and `team-data`. Every new message has exact keys, so an extra key or an unknown type is `malformed`.
- `msg-answer` carries `confirmed: true`, and only an option or a reply: never an action item's stepper result, never a channel change.
- A list that doesn't fit one message is cut into pages with `more`.
- New refusals that keep the connection open: `not-allowed-from-phone`, `offline`, `signed-out`, `not-found`, `not-supported`. Until G2 the host answers every version 4 message with `not-supported`.
- The host speaks only version 4. A version 4 phone falls back to version 3 for one release (`gatewayFallbackProtocolVersion`); the phone's fallback screens are G3's.

## Covers

- ports.remote-gateway-protocol
