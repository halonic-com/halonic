# Decision: a known cause is the reason on line 1, and a socket path that is too long is one

- Approval: Liam approves this note in his review of this pull request on HAL-13862 (a team decision with no board card, HAL-2282 rule: it rewords lines the board already approved)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cCcIG0UAwA5hgvraE6BKaB8fnUNCAWORheHWL4/j2nHD5IHnZWlYIIFgrAhHssu9gB3Gb8vQAz7M0G7AkAzZAA==
- Task: HAL-13862

## What changes

With a long `HALONIC_HOME`, a harness run failed with "Support reply failed in the step Draft a
reply. Halonic can't tell the cause yet: The bridge's socket path would be 161 bytes, and Linux
takes at most 107. Move Halonic's data to a shorter path." and a line asking for a bug report
(found by Nina in the HAL-13857 check, T6). The sentence knows its cause and its fix, so both the
frame and the report line were wrong.

- The bridge's error now carries the typed cause `harness-bridge.socket-path-too-long`, with the
  path's length, the limit and the system as detail, never the path itself
  (`harness-bridge.socket-path-limit`). The engine already records an error's `failureCause` on
  `run.failed`, so nothing in the engine changes.
- `@halonicjs/app` reads an `error` with that cause as a known cause (`causeKnown`), as it does
  for `disk-full`, `interrupted` and `answer-not-an-option` (`app.run-failure`).
- The CLI's line 1 for a known cause now says the step, then the engine's message as the reason:
  "Support reply failed in the step Draft a reply. The bridge's socket path would be 161 bytes,
  and Linux takes at most 107. Move Halonic's data to a shorter path." Line 2 stays left out
  (`cli.run-failure`). This also changes `disk-full`, `interrupted` and `answer-not-an-option`,
  which printed "Halonic can't tell the cause yet: *message*" with no line 2 since HAL-6451: a
  cause Halonic knows is no longer called one it can't tell. A known cause with an empty message
  keeps "Halonic can't tell the cause yet."

## Why

HAL-6451 dropped the bug report line for a known cause but kept "can't tell the cause yet" in
front of a message that names it. A full stop after the step, as the general line already has,
keeps the engine's message a sentence of its own, so a message that starts with a capital or a
code such as `ENOSPC` reads right.

## Not in this change

Studio's run page doesn't read `causeKnown` yet and still says "Halonic can't tell the cause yet."
for all of these, and a bridge the agent host opens sends only its message back, not the cause.
Both are separate follow-ups if we want them; the default data path is short enough on both.

## Tests

No test was weakened or removed. The CLI test of a known cause now expects the new line 1, and a
new case keeps the general line for a known cause without a message. New cases cover the socket
path's cause in the bridge, its facts in `app`, and the CLI's two lines from Nina's exact message.

## Covers

- harness-bridge.socket-path-limit
- app.run-failure
- cli.run-failure
