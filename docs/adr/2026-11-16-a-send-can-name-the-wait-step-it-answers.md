# A send can name the wait step it answers

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

A person's answer to a `wait` step used to name nothing but the run. If the
step was answered somewhere else (a phone, the CLI, a timer) and the run moved
on to a second wait step that takes the same events, a card that was still open
for the first step answered the second. Answers to tool calls don't have this
problem, because they name their `callId` and the engine refuses a mismatch.

`SendOptions.wait` closes the gap, but it is a new input that an adapter must
honor: an adapter that ignores it, or a host that drops it, would still let the
stale card answer. The [port freeze](2026-11-07-port-list-and-versions.md)
says that is a breaking change.

## Decision

**`RunExecutor` is at version 2.** `SendOptions.wait` names the wait step an
event is meant for: its `state` and the time it started waiting (`since`, the
run summary's `lastWaitingAt`). An executor refuses a `send` whose `wait`
doesn't name the step the run waits at now, before it records anything. The
engine's code for this is `engine.decision-wait-must-match`.

- The `contracts.run-executor-send` suite tests it, and every adapter passes it:
  the local executor, the remote executor, and the fakes the kernel and the
  node runtime tests use.
- `GET /api/hello` reports the `runExecutorVersion` the host honors.
- The remote executor reads it before it sends an answer that names a wait
  step, and refuses with a `RangeError` toward a host that reports none or a
  lower version. It sends nothing then, rather than let an older host drop
  the field.
- The Inbox names the step in every answer to a `wait` card.

## Consequences

A stale card gets a clear refusal instead of answering the next step. The
remote executor can't answer a wait card on a host that hasn't been updated:
it asks to update the host. An answer to a tool call is not affected.

Hosts and clients of different versions now meet through `hello`; any later
version bump of a port can use the same field.
