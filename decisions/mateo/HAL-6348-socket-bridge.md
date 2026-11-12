# Decision: sandbox-srt serves a bridge on a Unix socket

- Requirements: `sandbox-srt.profile-to-srt-config` (`packages/adapters/sandbox-srt/requirements/profile-to-srt-config.md`), `sandbox-srt.session` (`packages/adapters/sandbox-srt/requirements/session.md`)
- Task: HAL-6348, PR 3 of the HAL-6316 plan (each run's bridge on a private Unix socket, W9)
- Approval: the maintainer (Liam) approved the HAL-6316 plan on HAL-6340 and approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:sfSlMzNRv4OsmZ/P7v9NYBIqiy1mtflzalmpcUboFGi6Kw9/6vQNN62SgaRvYVfNZgrTpS4oSjQrZWQnrkDzDQ==

## What changes

The ports change of HAL-6316 adds a second kind of bridge, `{ name, socketPath }`. Both
requirements gain it, and nothing they already say is removed or loosened:

- **profile-to-srt-config:** the statement names both kinds of bridge. A new example says a
  socket bridge becomes the allowed domain `<name>:80` plus srt's `mitmProxy` rule for the name
  and socket, and that a loopback bridge or none routes nothing to a socket.
- **session:** a new example says opening fails, before anything runs, for a socket bridge with a
  relative path, a path longer than the system allows (107 bytes on Linux, 103 on macOS), or a name that is a pattern, `localhost`,
  an address, carries a port or is refused by srt; exactly 107 bytes opens.

The loopback bridge's examples and tests stay as they are.

## Tests

No test was skipped or loosened. New unit tests in `srt-config.test.ts` and
`srt-session-bridge.test.ts` cover both examples, and a new fence test checks the route end to end
on bubblewrap and Seatbelt. In `srt-session-bridge.test.ts` the one placeholder test from the ports
change ("rejects a bridge on a Unix socket until srt's rule for it lands") is replaced: it checked
the temporary throw this change removes, and the new tests check what opens and what is refused.

## Covers

- sandbox-srt.profile-to-srt-config
- sandbox-srt.session
