# A sandbox session proves its fence before it runs anything

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

A sandbox that silently fails to confine a program is worse than none, because the person believes they are protected. The HAL-958 design needs the integration runner, script runner and harness runs to show "actually running inside the fence" the same way. We considered a separate `verify()` call on the port, and a result on the session.

## Decision

`SandboxSession` has a read-only `fence` of type `SandboxFence`: `fenced`, `not-fenced` with a one-sentence reason, or `stopped`. The adapter runs its own probes (a canary file the fence hides and a canary loopback port the fence blocks) while `open` runs, so the proof is settled before any untrusted code loads. `start` throws while the proof is `not-fenced`. Every adapter passes the same contract case, and the sandbox CI runs the canary probes on Linux, macOS and Windows.

`sandboxVersion` goes from 1 to 2. Callers that don't read `fence` keep working. Adapters must add the member.

## Consequences

Studio and the CLI can show the proof without asking the adapter again. Adapters carry a probe cost at `open`. The reason codes for a sandbox that cannot start at all belong to `SandboxCheck` and are a separate change (HAL-1706), which may bump the version again to 3 before v0.1.
