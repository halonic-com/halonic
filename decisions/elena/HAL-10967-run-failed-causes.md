# Decision: run.failed says why a sandbox or harness program didn't start

- Approval: [HAL-10967](/HAL/issues/HAL-10967); a team decision, engine and events only, no user-visible change
- Kind: internal
- Task: HAL-10967

## What changes

`run.failed` for `sandbox-start-failed` now carries `sandboxReason` when the engine can find it: after `Sandbox.open()` fails, the engine asks `Sandbox.check()` again and logs its reason code. `run.failed` for `harness-start-failed` carries the new `harnessCause` (`not-installed` or `signed-out`) when `Harness.detect()` says so. Both fields are left out when the engine doesn't know. They travel through the engine's own `StartFailedError`, so an adapter can't set them. Older logs read as before.

## Why

The CLI's approved lines (cli-output 3.4) need the sandbox reason and the known harness causes, and the run log didn't have them. A follow-up adds the lines to the CLI.

## Covers

- engine.run-harness-failures
- engine.run-failure-reason-of
- events.run-failed-sandbox-not-ready
- events.run-failed-sandbox-start-failed
- events.run-failed-harness-cause
- events.run-log-contract
