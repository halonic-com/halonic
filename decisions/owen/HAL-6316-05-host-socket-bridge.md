# Decision: the host's socket bridge test skips on Windows

- Task: HAL-6316, step 5: the agent host serves each run's bridge on a Unix socket on Linux and macOS
- Approval: the maintainer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0i1Re1lO1Tl8UIf2zsdzgbjgLKys7N94hKFx5Nd8dUUoKAs/vC2Yv2eQACPYfgnzx9TlAhjpyXZ/Ob3DuNwYDQ==

## What changes

One new test in `bridge-routes.test.ts` checks that a bridge opened with a socket folder answers
with the socket's path and the name `bridge.halonic.invalid`, and that a bridge on a loopback port
gives no socket path. It skips with `it.skipIf(process.platform === "win32")`, and its name starts
with `[platform:win32] the host serves sockets only on Linux and macOS:`, so the skipped-test
reporter accepts the skip on the Windows job and lists it.

The host only serves sockets on Linux and macOS: on Windows each run's bridge stays on a loopback
port. The bridge also checks that the socket folder has mode 0700 and belongs to us, and Windows
has no POSIX modes. CI runs the test on Linux on every pull request. The Windows path,
a bridge on a port, is covered on every platform by the other tests in the same file.

## Tests

No test was removed or skipped that ran before.

## Covers

- apps/agent-host/src/bridge/bridge-routes.test.ts
