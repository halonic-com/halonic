# Decision: the host removes the bridge folders a crashed host left, and its test skips on Windows

- Requirements: `agent-host.sweep-lock` (`apps/agent-host/requirements/sweep-lock.md`), `harness-bridge.socket-sweep` (`packages/adapters/harness-bridge/requirements/socket-sweep.md`, new)
- Task: HAL-7302, a follow-up from Liam's review of HAL-6316 on HAL-7227
- Approval: the maintainer (Liam) approves this note in review
- Kind: internal

## What changes

`agent-host.sweep-lock` is extended, not weakened. While the host holds the profile lock, and
before it serves, it now also removes the run folders in `<profile>/bridges` that a crashed host
left behind, on Linux and macOS. If that fails, it says why on standard error and serves all the
same. A host that doesn't get the lock leaves the `bridges` folder as it is. One example is added
and one is extended with that last point. Everything the requirement said before still holds.

What counts as left behind is the new requirement `harness-bridge.socket-sweep`: a private run
folder (ours, mode 0700, not a link) whose `bridge.sock` refuses a connection, or that has been
empty for at least a minute. Studio and the CLI can both run a host on one profile and serve in
the same `bridges` folder, so the sweep leaves a live bridge's folder alone.

## Tests

One new test in `sweep-lock.test.ts` skips with `it.skipIf(process.platform === "win32")`, and its
name starts with `[platform:win32] the host serves sockets only on Linux and macOS:`, as the socket
test of HAL-6316 does. On Windows each run's bridge is on a loopback port and there is no
`bridges` folder to sweep. CI runs the test on Linux on every pull request.

No test was removed or skipped that ran before. The existing test of a second host on a locked
profile now also checks that it leaves the `bridges` folder as it is.

## Covers

- agent-host.sweep-lock
- apps/agent-host/src/sandbox/sweep-lock.test.ts
