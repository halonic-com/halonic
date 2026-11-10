# A harness's detect() can say "signed out"

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Claude Code and Codex need a sign-in, or a key Halonic holds, before they
can call a model. `detect()` had four answers: `ready`, `missing`,
`unsupported` and `failed`. A signed-out program came back as `ready`, so
Studio, `halonic doctor` and `halonic run` called it ready and the run then
ended within a second as `harness-start-failed`.

Both programs answer locally, in under a second, whether someone is signed
in: `claude auth status` and `codex login status` exit with 1 when no one is
(HAL-2307, fact check on HAL-2387). We looked at keeping the sign-in out of
the port and letting each caller run the check itself, but only the adapter
knows its program's commands, and `detect()` already asks the program
through `ProgramProbe`.

## Decision

**`HarnessDetection` gets a fifth case, `{ status: "signed-out", version }`.**
`detect()` returns it when the program is installed in a supported version
and its own sign-in check says no one is signed in. It carries the version,
because Studio still shows "Found Claude Code 2.1.321 · not signed in".

**Signed out is not an error by itself.** When Halonic holds a key for the
agent's model provider, the bridge adds it and the program runs without a
sign-in. Whether to warn is the caller's rule (harness states, rule 2 on
HAL-2350), not the adapter's.

**Never a guess.** An adapter says `signed-out` only when its program's
check clearly says so. When the check doesn't exist in that version, or
answers in a way the adapter doesn't recognise, it says `ready`; a run that
then can't sign in ends as `harness-start-failed`, as before. An expired
sign-in can still look signed in on this computer, for the same reason.

**Version 2.** A new case in what a port returns is not an optional field
callers may ignore: a caller that handles every case would miss it. Under the
port freeze ([port list and versions](2026-11-07-port-list-and-versions.md))
that is breaking, so `harnessVersion` goes from 1 to 2. No program adapter
had been written against version 1; the built-in loop and the script
harness in the contract tests never return the new case.

## Consequences

- The Claude Code and Codex adapters (HAL-194, C1 and D1) check the sign-in
  after the version, through the same `ProgramProbe`.
- Callers decide what to show: `halonic doctor`'s Harnesses line and the
  readiness strip add a signed-out case for agents without a key (HAL-2350,
  open item C1). Until they do, a signed-out harness isn't listed as ready.
- `ports.harness-signed-out` keeps the shape true; the port's type test
  fails to compile on a signed-out answer without a version.
