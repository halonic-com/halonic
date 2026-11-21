# Decision: the background engine says when a run changed

- Task: HAL-14219 (B1 step 4, PR 3)
- Approval: Liam, plan review on HAL-14219 (interface point 2) and review of PR 2 on HAL-14861
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vE0czqbEVngKfzH5NkGOUhJmHv+o3e1axLpiPxVV7fUIcoqgpWAmvWbBUoJ+ioly4I2miUHPZq0rmEWOoxDyBw==

## What changes

`studio.workspace-runs` said the app reads the runs again every 10 seconds
while anything listens. Where the background engine runs the workspace
(`studio.remote-engine`), the app now follows the engine's run changes
(`GET /api/run-updates`) instead: it reads the runs again each time the engine
says one changed, each time it connects to the feed again, and when the window
comes to the front. A feed that breaks off connects again after 10 seconds. A
change told of during a read makes the app read once more. Without a background
engine, the 10-second reads stay as they are.

`studio.remote-engine` said the window uses the engine when it answers
`GET /api/hello`. It now needs a success status: an engine that refuses hello is
reported, and the window runs its own engine as before.

No test is weakened or removed; new tests cover both.

## Why

Liam approved the run-updates route on the plan for HAL-14219 so that the
10-second reads can go away with the background engine, keeping one read when
the window comes to the front for runs a terminal starts. Liam's review of PR 2
(#4330) asked that a refusing engine not count as one.

Nothing changes for a person until step 5 (HAL-14220) starts the engine: until
then the shell reports no engine, and the window runs its own as before.

## Covers

- studio.workspace-runs
- studio.remote-engine
