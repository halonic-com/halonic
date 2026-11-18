# Decision: the gateway refuses a request with two Host lines and a message that starts with a byte order mark

- Task: HAL-11755 (two Low findings of the attack tests on HAL-5687)
- Approval: HAL-11755, Liam's review of the pull request; Liam signs this note as the CTO
- Kind: internal

## What changes

- A request with two `Host` lines is answered with 421, whichever line is ours. The listener counts the `host` entries in the raw headers.
- The message parser keeps a leading byte order mark instead of dropping it, so the text is not one JSON object and the answer is `malformed`.
- `remote-gateway.listener`, `remote-gateway.message-parser`, `tunnel-attacks.host-and-origin` and `tunnel-attacks.frame-attacks` each get a sentence or an example for it.

Nothing a requirement promised is weakened: the new sentences only add two refusals.

## Why

The listener read the first `Host` and never saw the second, so a hop that reads the other line could disagree with the gateway. A leading byte order mark was dropped, so a message that is not strict JSON was read as valid.

## Tests

No test was weakened or removed. Unit tests cover both refusals in the gateway package, and the attack suite got a two-`Host` case and a byte order mark case that pass now.

## Covers

- remote-gateway.listener
- remote-gateway.message-parser
- tunnel-attacks.host-and-origin
- tunnel-attacks.frame-attacks
