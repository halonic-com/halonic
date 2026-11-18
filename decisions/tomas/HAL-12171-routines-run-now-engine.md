# Decision: Run now on the Routines page starts its run through the app's engine

- Approval: HAL-12171
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nlL3XOrd17LCa26SebVdPypyjYyxPbrOGrHFHYTpZPa0fk5plW2eOVKCc3dxVI7tQb20oDVJdFMd3nUtdiTfCQ==

## What changes

`studio.workspace-routines`: the requirement gains one sentence. When the app has an engine, the
routine's Run now gets the routine's target with its `{{trigger.*}}` placeholders filled in
(`{{trigger.lastRun}}` null) and the engine starts it as a manual run of the routine, so the run
shows in the Runs list under the routine. Nothing else in the requirement changes, and no example
is changed or removed.

## Why

Run now was in the Routines page but did nothing in the desktop app, because the routines host had
no engine. The engine service now starts a routine's target (`studio.engine-service`,
`startRoutine`), with the same refusals as a workflow started from the Workflows page: an agent in
a harness or one that lists a connector is refused as `unavailable` before the engine opens, and a
routine that starts an agent is refused until agent runs are built.

## Covers

- studio.workspace-routines
