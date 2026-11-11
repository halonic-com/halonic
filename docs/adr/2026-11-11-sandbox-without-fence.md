# Sandbox without a fence: the launcher reports strength `none` and fence `off`

- **Status:** Proposed
- **Date:** 2026-11-11

## Context

Where the sandbox can't start (native Windows, a container, restricted user
namespaces, bubblewrap missing), the user can say yes to running plugin and
integration code without it (HAL-958 design 4.3, Julian's ruling on HAL-972).
That code still runs in the separate integration runner, with Node's
permission layer, the stdio bridge and an environment holding only `TMPDIR`.
Only the fence is missing. The design starts it through `sandbox-host`, so
`sandbox-host` and `sandbox-srt` stay the only adapters that start programs,
and every start goes through the `Sandbox` port, where a fake can count them
(HAL-3386 test plan, seam 3). The harness host already expects the same: the
`this-computer` placement opens "the launcher's unfenced session" through
the `Sandbox` port.

The port couldn't say this. A session's fence proof was `fenced`,
`not-fenced` (and then `start` throws) or `stopped`, and a sandbox's strength
was `os`, `vm` or `remote`. A launcher reporting `fenced` or `os` would lie
to the trust check and the run log; one reporting `not-fenced` couldn't start
anything.

## Decision

**`SandboxStrength` gains `none`**: no fence at all, only the launcher.

**`SandboxFence` gains `{ state: "off" }`**: the adapter has no fence by
design, so there is nothing to prove and `start` works. Only an adapter with
strength `none` reports it. A fenced adapter whose fence fails still reports
`not-fenced` and refuses to start, so a failed fence can never read as `off`.

**Who decides is unchanged.** The launcher's `check()` is always `ok`: it
answers whether the launcher works, not whether the fence does. Whether a
start may go to the launcher is decided before it, from the fenced sandbox's
`check()` and the user's saved yes for that reason (`runnerFence` and
`UnfencedRuns` in `core/app`). `runnerFence` reads any proof other than
`fenced` on a machine that passed the check as `stopped`, so `off` there never
runs code.

**The harness engine refuses a strength-`none` sandbox for the `sandbox`
placement.** It would otherwise log `sandbox.opened` for an agent that runs
without a fence. The `this-computer` placement already logs `sandbox.off`.

**Version 5.** A new value an adapter and every reader must handle is
breaking under the port freeze
([port list and versions](2026-11-07-port-list-and-versions.md)), so
`sandboxVersion` goes from 4 to 5. The `sandbox.opened` event keeps its own
strengths (`os`, `vm`, `remote`): it is never written for the launcher.

## Consequences

- `sandbox-host` gets `createHostSandbox()`: it starts a program with the
  profile's environment only, in the working folder, in its own process
  group (a process tree on Windows), stops the whole group on `kill`, close,
  the time limit and the open signal, and reports no blocks, because nothing
  is fenced off.
- `ports.sandbox-fence-proof` gains the `off` example. `sandbox-srt` never
  reports `off` or `none`.
- The integration runner starts through it on the confirmed path, and its
  connection reports the proof `off`, so the connector page and the trust
  check say "without the fence" every time.
