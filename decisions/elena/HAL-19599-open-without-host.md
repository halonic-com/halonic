# Decision: a Recent row opens once the engine is ready, without waiting for the agent host

- Task: HAL-19599
- Approval: Liam approved this as steps 2 and 5 of the plan on HAL-19531; the package owner (Liam) approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qU+M1BpX3e+hpoD/8uA0NBFHPyg6WeGqzrAA0YPPbgqfn/IPBxNVskdvLqpDZ2g4/9BLlUKMFQQgO94jIKpuAA==

## What changes

`shell.welcome-start`: a press on a Recent row no longer waits for the whole start to be ready.
It waits only until the start's engine is ready (the phase `engine_ready` or later), not for
`host_started`. **Open demo** and **Open folder** still wait for the whole start, as before. A
failed start still drops a held press. One example was added.

`shell.welcome-recent`: the opening row now shows the step it waits on under its folder,
"Starting the engine…" and then "Reading the workspace…". The polite "Opening…" status for
screen readers stays as it was. One example was added.

`studio.src-tauri.open-timings` (still a draft, from #6514): a refused or timed-out `engine_open`
gets a timing line too, with the refusal's fixed kind, such as `engine_failed`. One example was
added.

No example was removed or weakened, and no test was changed or removed.

## Why

The board reported that opening a recent workspace right after Studio starts takes about 20 seconds
on Windows (HAL-19531). The Recent press was held until the agent host had started, which on
Windows goes through several `wsl.exe` steps, and opening a workspace doesn't need the host. Runs
and assistant sessions still go through the host: until it is up, the shell holds their calls, and
the engine gets no sandbox host, so nothing starts before the host's check has passed. The visible
step follows the board's principle that progress is visible. The failed-open line was Liam's
[minor] on #6514.

## Covers

- shell.welcome-start
- shell.welcome-recent
- studio.src-tauri.open-timings
