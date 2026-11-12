# Decision: closing the terminal stops a command as Ctrl C does, with 129

- Approval: Liam asked for this fix on HAL-6558, found while checking the launch FAQ on HAL-6548; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:THal5coAuGd+RcwgxatHC+1/pppqEHwE6GgGx0FAZwoMosne0a/rwltxGqfFTbUuDyeMR5WR2Nog2BhKPFFyCw==
- Task: HAL-6558

## What changes

`cli.stop`: SIGHUP joins Ctrl C and SIGTERM. The first one asks the command to stop cleanly, so a
run is cancelled after its step and `halonic runs show` says so later, with the texts Ctrl C
already uses. The command exits with 129 (128 + 1). The requirement gains one example for a
closed terminal window, and its rule about a closed pipe now also covers a closed window, because
writing to it fails with `EIO`, not `EPIPE`.

`cli.help-exit-codes`: the help's last exit-code line reads "129, 130 or 143 stopped", so the help
still lists every code the CLI can end with.

## Why

Without a listener, Node's default for SIGHUP kills the process in the middle of a step. The run
stays "Running" until the next run on the workspace ends it as failed, with a text that tells the
user to report an engine fault that never happened.

Watching SIGHUP alone isn't enough: once the window is gone every write to it fails with `EIO`,
and `quietOnClosedPipe` rethrew that, so the next update of the live line would still crash the
run mid-step. A probe under a real pseudo-terminal showed both the single SIGHUP a job gets from
`bash` when its window closes and the `EIO` on each write after it.

No test was weakened or removed. The one changed count (`stop.test.ts`, three signals watched
rather than two) follows from the new signal.

## Covers

- cli.stop
- cli.help-exit-codes
