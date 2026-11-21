# studio.new-agents-run

- Status: active
- Since: unreleased
- Source: HAL-12321, following HAL-9509 (`app.new-agent-placement`, which had no caller) and HAL-9451 (Settings › Agent sandbox saves `sandbox.new-agents`)

When the desktop app creates an agent, it shall apply Settings › New agents run to it through `app.new-agent-placement`, after the agent's file is written: for the file exactly as written, keyed by the workspace's real path, the agent's hub and the agent's id, as the agent host reads the choice before a run. A choice that can't be saved shall not stop the agent being made: it shall be reported, and the agent shall stay in its sandbox. Without an agent host (the browser), nothing shall be placed.

## Examples

- Given New agents run is On this computer,
  when the agent "Refund checker" is created in acme,
  then the choice is recorded for `refund-checker` of acme in the workspace, for its file as written, and it runs on this computer.
- Given New agents run is In a sandbox, or nothing is saved,
  when an agent is created,
  then nothing is recorded and it runs in a sandbox.
- Given New agents run is On this computer and the agent host refuses the choice,
  when an agent is created,
  then the agent is made, the error is reported and it runs in a sandbox.
- Given an agent's file is edited after it was created On this computer,
  then it runs in a sandbox until a person chooses again.
