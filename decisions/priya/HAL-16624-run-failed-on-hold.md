# Decision: run.failed says the refused agent's this-computer choice is on hold

- Approval: Paperclip task HAL-16624 (split from HAL-15500); Liam approves this note in review
- Kind: internal

When a person set an agent to run on this computer and its file changed since, the agent runs in its sandbox until they confirm the choice again. If that sandbox can't start, `run.failed` said `sandbox-not-ready` exactly as for any other agent, so Studio's run controls and the Inbox couldn't tell "confirm again" from "fix the sandbox".

- The host's placement policy now passes on `onHold: true` with a `sandbox` answer whose reason is `file-changed`. It passes on nothing else of the choice.
- The engine's `SandboxNotReadyError` carries it, and `run.failed` gets `onHold: true` next to `sandboxReason` and `agent`.
- The field is optional, so older logs still parse; no screen reads it yet (HAL-15500 does).

## Covers

- events.run-failed-sandbox-not-ready
- engine.run-failure-reason-of
- engine.run-harness-failures
- harness-host.placement
