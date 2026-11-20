# A backend the app doesn't offer here says `not-offered`

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Studio has no session outside the sandbox, so its "on this computer" backend
refuses every agent set to it (HAL-10849). Its check said `other`, the only
code that fit, and Studio worded that as "Halonic can't tell what the sandbox
is missing". That isn't true: nothing is missing, the app just doesn't offer
the backend, and the fix is to set the agent back to the sandbox (C52 claim
2.3, team decision on HAL-12643). We looked at keeping `other` and string
matching the check's `missing` sentence in Studio, but `missing` is for logs,
and Studio words a refusal from the code alone (HAL-2089).

## Decision

**`not-offered` is a new `SandboxUnavailableReason`:** the app doesn't offer
this backend here. Studio's `this-computer` backend returns it. It sits just
before `other`, because the person fixes it in one step.

**Version 8 of `Sandbox`.** The list is closed, so a new code is a breaking
port change, as in version 6 (docs/adr/2026-11-11-pluggable-sandbox-layer.md).
Nothing else in the port changes.

## Consequences

- Every catalogue that words each code words `not-offered`: Studio's
  sandbox-start words ("Halonic can't run Claude Code or Codex agents outside
  the sandbox yet. Save a change to this agent's file, which puts it back in
  the sandbox."), the CLI's sandbox
  messages and Settings' backend sentence. The compiler finds a catalogue that
  misses it.
- The runner's reasons take the check's code as it is, so they list it too. No
  runner backend returns it today.
- `port-shapes.test.ts` pins the list and its order.
