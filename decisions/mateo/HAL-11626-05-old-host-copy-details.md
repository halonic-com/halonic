# Decision: an answer a too-old host can't check says so, with no Try again

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11626 (row R15 of the UX check on HAL-11613; the sentence is a team wording decision on HAL-11626, after the approved connect-screen pattern; Liam approves this note in review)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:j6xo83utEv8KsILzgdoeR8yZJBQjO57pcz5DTKXGElQHRd04rnktkEhzZHnQ5xyXeyHCH/fqOQ3EWMkG3u8aCg==

Two requirements change, and one is new:

- `executor-remote.runs`: a `send` that names a `wait` step on a host too old to check it now rejects with `HostTooOld`, which is still a `RangeError`, so callers that catch that keep working. Nothing else changes.
- `inbox.wait-card`: for that error the alert slot says "Halonic on the server is too old for this answer. Update Halonic on the server, then answer again." ("Halonic on your computer …" on a phone) instead of "Couldn't record your decision." with a **Try again** that can't work. A scenario covers it.
- New: `ports.host-too-old`, the error and its check.

No test was weakened.

## Covers

- executor-remote.runs
- inbox.wait-card
