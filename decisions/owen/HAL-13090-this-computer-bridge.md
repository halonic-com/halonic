# Decision: the CLI's bridge-place tests skip on Windows

- Task: HAL-13090: an agent set to "On this computer" gets a loopback bridge, a fenced run keeps its Unix socket
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13090 (the maintainer, Liam, approves this note in review)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5mnqcrd+dg+kpqk2FXBNQITpolw68HXUJD99CMdKoG1WgqZEFuIbbBWpZwSHp9kfFIm9bTtzoYg8LGzcTT5gDw==

## What changes

`local-harness-host-bridge.test.ts` is a new file with two tests. They start a run with this
computer's real launcher and the CLI's real bridge servers, and check where each run's bridge is:
on loopback for a run on this computer, and on a Unix socket for a fenced run. Both skip with
`it.skipIf(process.platform === "win32")`, and their names start with
`[platform:win32] the CLI serves bridges on sockets only on Linux and macOS:`, so the skipped-test
reporter accepts the skip on the Windows job and lists it.

The bug they cover happens only where the CLI serves sockets, on Linux and macOS. On Windows every
run's bridge is on a loopback port, so a fenced run and a run on this computer get the same bridge
and nothing can disagree. The CLI also can't find a harness program on Windows yet. CI runs both
tests on Linux on every pull request.

## Tests

No test was removed or skipped that ran before.

## Covers

- apps/cli/src/local-harness-host-bridge.test.ts
